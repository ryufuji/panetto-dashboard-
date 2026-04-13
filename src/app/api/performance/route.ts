import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, organization_id, department_id')
      .eq('id', user.id)
      .single()

    if (!currentUser || currentUser.role === 'employee') {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 })
    }

    // Fetch users in scope
    let usersQuery = supabase
      .from('users')
      .select('id, name, department_id, position, monthly_salary, external_user_id, department:departments!users_department_id_fkey(id, name)')
      .eq('organization_id', currentUser.organization_id)
      .eq('is_active', true)

    if (currentUser.role === 'manager') {
      usersQuery = usersQuery.eq('department_id', currentUser.department_id!)
    }

    const { data: users, error: usersError } = await usersQuery
    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ data: [], departmentSummary: [] })
    }

    const userIds = users.map(u => u.id)

    // Fetch reports in date range with submitted/approved status
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, user_id, work_hours, status, report_date')
      .eq('organization_id', currentUser.organization_id)
      .in('status', ['submitted', 'approved'])
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .in('user_id', userIds)

    if (reportsError) {
      return NextResponse.json({ error: reportsError.message }, { status: 500 })
    }

    const reportIds = (reports || []).map(r => r.id)

    // Fetch report tasks for those reports
    let tasks: any[] = []
    if (reportIds.length > 0) {
      // Supabase .in() has a limit; batch if needed
      const batchSize = 100
      for (let i = 0; i < reportIds.length; i += batchSize) {
        const batch = reportIds.slice(i, i + batchSize)
        const { data: batchTasks, error: tasksError } = await supabase
          .from('report_tasks')
          .select('id, report_id, estimated_hours, actual_hours, progress_rate, priority, due_date')
          .in('report_id', batch)

        if (tasksError) {
          return NextResponse.json({ error: tasksError.message }, { status: 500 })
        }
        if (batchTasks) tasks = tasks.concat(batchTasks)
      }
    }

    // Build report -> user_id map
    const reportUserMap = new Map<string, string>()
    const reportDateMap = new Map<string, string>()
    for (const r of reports || []) {
      reportUserMap.set(r.id, r.user_id)
      reportDateMap.set(r.id, r.report_date)
    }

    // Group tasks by user
    const userTasksMap = new Map<string, any[]>()
    const userWorkHoursMap = new Map<string, number>()

    for (const t of tasks) {
      const userId = reportUserMap.get(t.report_id)
      if (!userId) continue
      if (!userTasksMap.has(userId)) userTasksMap.set(userId, [])
      userTasksMap.get(userId)!.push(t)
    }

    // Sum work hours by user from reports
    for (const r of reports || []) {
      const prev = userWorkHoursMap.get(r.user_id) || 0
      userWorkHoursMap.set(r.user_id, prev + (r.work_hours || 0))
    }

    // Fetch store daily report tasks (tasukaru) for the same date range
    // Join through store_daily_reports to get date range + external_user_id
    const { data: storeReports } = await supabase
      .from('store_daily_reports')
      .select('id, external_user_id, report_date')
      .eq('organization_id', currentUser.organization_id)
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)

    // Build external_user_id -> user.id mapping
    const externalToUserMap = new Map<string, string>()
    for (const u of users) {
      if (u.external_user_id) {
        externalToUserMap.set(u.external_user_id, u.id)
      }
    }

    // Fetch store tasks for those reports
    const storeReportIds = (storeReports || []).map(r => r.id)
    let storeTasks: any[] = []
    if (storeReportIds.length > 0) {
      const batchSize = 100
      for (let i = 0; i < storeReportIds.length; i += batchSize) {
        const batch = storeReportIds.slice(i, i + batchSize)
        const { data: batchTasks } = await supabase
          .from('store_daily_report_tasks')
          .select('id, report_id, status, due_date, synced_at')
          .in('report_id', batch)
        if (batchTasks) storeTasks = storeTasks.concat(batchTasks)
      }
    }

    // Map store report -> external_user_id -> user_id
    const storeReportUserMap = new Map<string, string>()
    for (const sr of storeReports || []) {
      const userId = externalToUserMap.get(sr.external_user_id)
      if (userId) storeReportUserMap.set(sr.id, userId)
    }

    // Group store tasks by user
    const userStoreTasksMap = new Map<string, any[]>()
    for (const st of storeTasks) {
      const userId = storeReportUserMap.get(st.report_id)
      if (!userId) continue
      if (!userStoreTasksMap.has(userId)) userStoreTasksMap.set(userId, [])
      userStoreTasksMap.get(userId)!.push(st)
    }

    // Calculate metrics per user
    const results = users.map(u => {
      const userTasks = userTasksMap.get(u.id) || []
      const workHours = userWorkHoursMap.get(u.id) || 0
      const totalTasks = userTasks.length

      // Completed tasks (progress_rate = 100)
      const completedTasks = userTasks.filter(t => t.progress_rate === 100)
      const completedCount = completedTasks.length
      const completionRate = totalTasks > 0 ? Math.round(completedCount / totalTasks * 100) : 0

      // Estimation accuracy: avg(actual / estimated) where both > 0
      const estimationPairs = userTasks.filter(t => t.estimated_hours > 0 && t.actual_hours > 0)
      const estimationAccuracy = estimationPairs.length > 0
        ? Math.round(estimationPairs.reduce((sum, t) => sum + (t.actual_hours / t.estimated_hours), 0) / estimationPairs.length * 100)
        : null

      // Productivity: avg(progress_rate / actual_hours) where actual_hours > 0
      const productivityPairs = userTasks.filter(t => t.actual_hours > 0)
      const productivity = productivityPairs.length > 0
        ? Math.round(productivityPairs.reduce((sum, t) => sum + (t.progress_rate / t.actual_hours), 0) / productivityPairs.length * 10) / 10
        : null

      // Deadline adherence: completed on-time / completed with due_date
      const tasksWithDeadline = completedTasks.filter(t => t.due_date)
      let deadlineAdherence: number | null = null
      if (tasksWithDeadline.length > 0) {
        const onTime = tasksWithDeadline.filter(t => {
          const reportDate = reportDateMap.get(t.report_id)
          return reportDate && reportDate <= t.due_date
        })
        deadlineAdherence = Math.round(onTime.length / tasksWithDeadline.length * 100)
      }

      // Cost metrics
      let hourlyRate: number | null = null
      let taskCost: number | null = null
      if (u.monthly_salary && workHours > 0) {
        hourlyRate = Math.round(u.monthly_salary * 10000 / workHours)
        const avgActualHours = productivityPairs.length > 0
          ? productivityPairs.reduce((sum, t) => sum + t.actual_hours, 0) / productivityPairs.length
          : 0
        taskCost = avgActualHours > 0 ? Math.round(hourlyRate * avgActualHours) : null
      }

      // High priority ratio
      const highPriorityHours = userTasks
        .filter(t => t.priority === 'high' && t.actual_hours > 0)
        .reduce((sum, t) => sum + t.actual_hours, 0)
      const totalActualHours = userTasks
        .filter(t => t.actual_hours > 0)
        .reduce((sum, t) => sum + t.actual_hours, 0)
      const highPriorityRatio = totalActualHours > 0
        ? Math.round(highPriorityHours / totalActualHours * 100)
        : null

      // Store (tasukaru) metrics
      const userStoreTasks = userStoreTasksMap.get(u.id) || []
      const storeTotalTasks = userStoreTasks.length
      const storeCompletedTasks = userStoreTasks.filter(t => t.status === 'done').length
      const storeCompletionRate = storeTotalTasks > 0
        ? Math.round(storeCompletedTasks / storeTotalTasks * 100) : null

      // Deadline adherence: done tasks with due_date where synced_at <= due_date
      const storeTasksWithDeadline = userStoreTasks.filter(t => t.status === 'done' && t.due_date)
      let storeDeadlineAdherence: number | null = null
      if (storeTasksWithDeadline.length > 0) {
        const onTime = storeTasksWithDeadline.filter(t => {
          const syncedDate = t.synced_at ? t.synced_at.split('T')[0] : null
          return syncedDate && syncedDate <= t.due_date
        })
        storeDeadlineAdherence = Math.round(onTime.length / storeTasksWithDeadline.length * 100)
      }

      // Combined metrics
      const combinedTotalTasks = totalTasks + storeTotalTasks
      const combinedCompletedCount = completedCount + storeCompletedTasks
      const combinedCompletionRate = combinedTotalTasks > 0
        ? Math.round(combinedCompletedCount / combinedTotalTasks * 100) : 0

      const hasStoreMapping = !!u.external_user_id

      return {
        user_id: u.id,
        name: u.name,
        position: u.position,
        department: u.department,
        monthly_salary: u.monthly_salary,
        metrics: {
          totalTasks,
          completedCount,
          completionRate,
          estimationAccuracy,
          productivity,
          deadlineAdherence,
          hourlyRate,
          taskCost,
          highPriorityRatio,
          workHours: Math.round(workHours * 10) / 10,
          // Store (tasukaru) metrics
          storeTotalTasks: hasStoreMapping ? storeTotalTasks : null,
          storeCompletedTasks: hasStoreMapping ? storeCompletedTasks : null,
          storeCompletionRate: hasStoreMapping ? storeCompletionRate : null,
          storeDeadlineAdherence: hasStoreMapping ? storeDeadlineAdherence : null,
          // Combined
          combinedTotalTasks,
          combinedCompletedCount,
          combinedCompletionRate,
        },
      }
    })

    // Department summary (admin only)
    let departmentSummary: any[] = []
    if (currentUser.role === 'admin') {
      const deptMap = new Map<string, { name: string; members: number; metrics: number[]; totalTasks: number; totalHours: number; combinedTotalTasks: number; combinedCompletedCount: number }>()

      for (const r of results) {
        const deptId = (r.department as any)?.id || 'none'
        const deptName = (r.department as any)?.name || '未所属'
        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, { name: deptName, members: 0, metrics: [], totalTasks: 0, totalHours: 0, combinedTotalTasks: 0, combinedCompletedCount: 0 })
        }
        const d = deptMap.get(deptId)!
        d.members++
        d.metrics.push(r.metrics.completionRate)
        d.totalTasks += r.metrics.totalTasks
        d.totalHours += r.metrics.workHours
        d.combinedTotalTasks += r.metrics.combinedTotalTasks
        d.combinedCompletedCount += r.metrics.combinedCompletedCount
      }

      departmentSummary = Array.from(deptMap.entries()).map(([id, d]) => {
        const membersWithEstimation = results.filter(
          r => ((r.department as any)?.id || 'none') === id && r.metrics.estimationAccuracy !== null
        )
        const avgEstimation = membersWithEstimation.length > 0
          ? Math.round(membersWithEstimation.reduce((s, r) => s + r.metrics.estimationAccuracy!, 0) / membersWithEstimation.length)
          : null

        return {
          department_id: id,
          name: d.name,
          members: d.members,
          avgCompletionRate: d.metrics.length > 0 ? Math.round(d.metrics.reduce((a, b) => a + b, 0) / d.metrics.length) : 0,
          avgEstimationAccuracy: avgEstimation,
          totalTasks: d.totalTasks,
          totalHours: Math.round(d.totalHours * 10) / 10,
          combinedTotalTasks: d.combinedTotalTasks,
          combinedCompletedCount: d.combinedCompletedCount,
          combinedCompletionRate: d.combinedTotalTasks > 0
            ? Math.round(d.combinedCompletedCount / d.combinedTotalTasks * 100) : 0,
        }
      })
    }

    return NextResponse.json({ data: results, departmentSummary })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
