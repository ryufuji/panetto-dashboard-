import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
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

    // Check target user exists in same org
    const { data: targetUser } = await supabase
      .from('users')
      .select('id, name, department_id, organization_id, external_user_id')
      .eq('id', userId)
      .eq('organization_id', currentUser.organization_id)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    // Manager can only see own department
    if (currentUser.role === 'manager' && targetUser.department_id !== currentUser.department_id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
    }

    // Generate 6 months of data
    const now = new Date()
    const months: { year: number; month: number; dateFrom: string; dateTo: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = d.getMonth() + 1
      const lastDay = new Date(year, month, 0).getDate()
      months.push({
        year,
        month,
        dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
        dateTo: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        label: `${year}/${String(month).padStart(2, '0')}`,
      })
    }

    const trends = []

    for (const m of months) {
      const { data: reports } = await supabase
        .from('reports')
        .select('id, work_hours')
        .eq('user_id', userId)
        .in('status', ['submitted', 'approved'])
        .gte('report_date', m.dateFrom)
        .lte('report_date', m.dateTo)

      const reportIds = (reports || []).map(r => r.id)
      const workHours = (reports || []).reduce((sum, r) => sum + (r.work_hours || 0), 0)

      let tasks: any[] = []
      if (reportIds.length > 0) {
        const { data: taskData } = await supabase
          .from('report_tasks')
          .select('id, estimated_hours, actual_hours, progress_rate, priority')
          .in('report_id', reportIds)
        tasks = taskData || []
      }

      const totalTasks = tasks.length
      const completedCount = tasks.filter(t => t.progress_rate === 100).length
      const completionRate = totalTasks > 0 ? Math.round(completedCount / totalTasks * 100) : 0

      const estimationPairs = tasks.filter(t => t.estimated_hours > 0 && t.actual_hours > 0)
      const estimationAccuracy = estimationPairs.length > 0
        ? Math.round(estimationPairs.reduce((sum, t) => sum + (t.actual_hours / t.estimated_hours), 0) / estimationPairs.length * 100)
        : null

      // Store (tasukaru) tasks for this month
      let storeTotalTasks: number | null = null
      let storeCompletedTasks: number | null = null
      let storeCompletionRate: number | null = null

      if (targetUser.external_user_id) {
        const { data: storeReports } = await supabase
          .from('store_daily_reports')
          .select('id')
          .eq('external_user_id', targetUser.external_user_id)
          .eq('organization_id', currentUser.organization_id)
          .gte('report_date', m.dateFrom)
          .lte('report_date', m.dateTo)

        const srIds = (storeReports || []).map(r => r.id)
        if (srIds.length > 0) {
          const { data: stData } = await supabase
            .from('store_daily_report_tasks')
            .select('status')
            .in('report_id', srIds)

          const st = stData || []
          storeTotalTasks = st.length
          storeCompletedTasks = st.filter(t => t.status === 'done').length
          storeCompletionRate = storeTotalTasks > 0
            ? Math.round(storeCompletedTasks / storeTotalTasks * 100) : 0
        } else {
          storeTotalTasks = 0
          storeCompletedTasks = 0
          storeCompletionRate = null
        }
      }

      const combinedTotalTasks = totalTasks + (storeTotalTasks || 0)
      const combinedCompletedCount = completedCount + (storeCompletedTasks || 0)
      const combinedCompletionRate = combinedTotalTasks > 0
        ? Math.round(combinedCompletedCount / combinedTotalTasks * 100) : 0

      trends.push({
        label: m.label,
        year: m.year,
        month: m.month,
        completionRate,
        estimationAccuracy,
        workHours: Math.round(workHours * 10) / 10,
        totalTasks,
        completedCount,
        storeTotalTasks,
        storeCompletedTasks,
        storeCompletionRate,
        combinedTotalTasks,
        combinedCompletedCount,
        combinedCompletionRate,
      })
    }

    return NextResponse.json({ data: trends, user: { id: targetUser.id, name: targetUser.name } })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
