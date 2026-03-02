import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'incomplete_latest'

    if (!['incomplete_latest', 'incomplete_all', 'completed'].includes(mode)) {
      return NextResponse.json({ error: '無効なモードです' }, { status: 400 })
    }

    // Fetch user's submitted/approved reports ordered by date desc
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, report_date')
      .eq('user_id', user.id)
      .in('status', ['submitted', 'approved'])
      .order('report_date', { ascending: false })

    if (reportsError) throw reportsError
    if (!reports || reports.length === 0) {
      return NextResponse.json({ data: [] })
    }

    if (mode === 'incomplete_latest') {
      // Only get tasks from the latest report
      const latestReport = reports[0]
      const { data: tasks, error: tasksError } = await supabase
        .from('report_tasks')
        .select('*')
        .eq('report_id', latestReport.id)
        .order('order_index', { ascending: true })

      if (tasksError) throw tasksError

      const parentTasks = (tasks || [])
        .filter(t => !t.parent_task_id && t.progress_rate < 100)

      const result = parentTasks.map(pt => ({
        ...pt,
        report_date: latestReport.report_date,
        children: (tasks || [])
          .filter(t => t.parent_task_id === pt.id)
          .sort((a, b) => a.order_index - b.order_index),
      }))

      return NextResponse.json({ data: result })
    }

    // For incomplete_all and completed modes, fetch all tasks across reports
    const reportIds = mode === 'completed'
      ? reports
          .filter(r => {
            const reportDate = new Date(r.report_date)
            const ninetyDaysAgo = new Date()
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
            return reportDate >= ninetyDaysAgo
          })
          .map(r => r.id)
      : reports.map(r => r.id)

    if (reportIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const { data: allTasks, error: allTasksError } = await supabase
      .from('report_tasks')
      .select('*, report:reports!inner(report_date)')
      .in('report_id', reportIds)
      .order('order_index', { ascending: true })

    if (allTasksError) throw allTasksError
    if (!allTasks || allTasks.length === 0) {
      return NextResponse.json({ data: [] })
    }

    // Build report date lookup
    const reportDateMap = new Map(reports.map(r => [r.id, r.report_date]))

    // Deduplicate by title (keep the one from the most recent report)
    // Sort tasks by report date descending first
    const sortedTasks = [...allTasks].sort((a, b) => {
      const dateA = reportDateMap.get(a.report_id) || ''
      const dateB = reportDateMap.get(b.report_id) || ''
      return dateB.localeCompare(dateA)
    })

    // Deduplicate parent tasks by normalized title
    const seenTitles = new Set<string>()
    const uniqueParentTasks: typeof allTasks = []

    for (const task of sortedTasks) {
      if (task.parent_task_id) continue
      const normalizedTitle = (task.title || '').trim().toLowerCase()
      if (!normalizedTitle || seenTitles.has(normalizedTitle)) continue
      seenTitles.add(normalizedTitle)
      uniqueParentTasks.push(task)
    }

    // Filter by mode
    const filtered = mode === 'incomplete_all'
      ? uniqueParentTasks.filter(t => t.progress_rate < 100)
      : uniqueParentTasks.filter(t => t.progress_rate >= 100)

    // Attach children and report_date
    const result = filtered.map(pt => {
      const reportDate = reportDateMap.get(pt.report_id) || ''
      const children = allTasks
        .filter(t => t.parent_task_id === pt.id)
        .sort((a, b) => a.order_index - b.order_index)
      return { ...pt, report_date: reportDate, children }
    })

    return NextResponse.json({ data: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'エラーが発生しました' }, { status: 500 })
  }
}
