/**
 * LINE Works 連携の疎通確認用エンドポイント。
 *
 * 1. ?reportId=<UUID>   指定したレポートに対して notify-submission と同じフローを
 *                       実行（ただし lineworks_notified_at は更新しない）。
 *                       実際の日報データで失敗する原因を切り分けたいときに使う。
 *
 * 2. ?reportId=latest   自分の直近 submitted レポートを自動で対象にする。
 *
 * 3. パラメータなし     短いテストメッセージを 1 通送るだけ。
 *
 * いずれも admin ロールのみ。
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendLineWorksMessage, formatReportSubmittedMessage } from '@/lib/lineworks'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden (admin only)' }, { status: 403 })
  }

  // 環境変数の有無 (中身は出さない、有無のみ)
  const env = {
    LINEWORKS_CLIENT_ID: !!process.env.LINEWORKS_CLIENT_ID,
    LINEWORKS_CLIENT_SECRET: !!process.env.LINEWORKS_CLIENT_SECRET,
    LINEWORKS_SERVICE_ACCOUNT: !!process.env.LINEWORKS_SERVICE_ACCOUNT,
    LINEWORKS_PRIVATE_KEY: !!process.env.LINEWORKS_PRIVATE_KEY,
    LINEWORKS_BOT_ID: !!process.env.LINEWORKS_BOT_ID,
    LINEWORKS_CHANNEL_ID: !!process.env.LINEWORKS_CHANNEL_ID,
    LINEWORKS_WEBHOOK_URL: !!process.env.LINEWORKS_WEBHOOK_URL,
  }

  const reportIdParam = request.nextUrl.searchParams.get('reportId')

  // ── モード1: 単純なテストメッセージ ──
  if (!reportIdParam) {
    const testMessage = `[テスト] LINE Works 疎通確認 ${new Date().toISOString()}`
    const result = await sendLineWorksMessage(testMessage)
    return NextResponse.json({ mode: 'simple', sent_message: testMessage, result, env })
  }

  // ── モード2/3: 実レポートでフロー実行 ──
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let reportId = reportIdParam
  if (reportIdParam === 'latest') {
    const { data: latest } = await admin
      .from('reports')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single()
    if (!latest) {
      return NextResponse.json({ error: 'no_submitted_report_found_for_user', env })
    }
    reportId = (latest as any).id
  }

  const { data: report, error } = await admin
    .from('reports')
    .select(
      'id, user_id, status, report_date, title, work_hours, progress_rate, next_day_plan, ' +
      'start_time, end_time, submitted_at, lineworks_notified_at, ' +
      'user:users(name, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)), ' +
      'tasks:report_tasks(id, title, description, memo, actual_url, task_status, progress_rate, priority, estimated_hours, actual_hours, due_date, parent_task_id, order_index)'
    )
    .eq('id', reportId)
    .single()

  if (error || !report) {
    return NextResponse.json({
      mode: 'report',
      reportId,
      error: 'report_select_failed',
      detail: error?.message,
      code: error?.code,
      env,
    })
  }

  // planned_tasks は別クエリ (PostgREST FK キャッシュ問題回避)
  const { data: plannedRows } = await admin
    .from('report_planned_tasks')
    .select('title, order_index')
    .eq('report_id', reportId)
    .order('order_index', { ascending: true })

  const f = report as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks: any[] = f.tasks || []
  const parentTasks = allTasks
    .filter((t: any) => !t.parent_task_id)
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childByParent = new Map<string, any[]>()
  for (const t of allTasks) {
    if (!t.parent_task_id) continue
    const arr = childByParent.get(t.parent_task_id) || []
    arr.push(t)
    childByParent.set(t.parent_task_id, arr)
  }
  for (const arr of childByParent.values()) {
    arr.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }
  const plannedSorted = plannedRows || []

  let message: string
  try {
    message = formatReportSubmittedMessage({
      reportId: f.id,
      userName: f.user?.name || '不明',
      reportDate: f.report_date,
      submittedAt: f.submitted_at || null,
      startTime: f.start_time || null,
      endTime: f.end_time || null,
      officeName: f.user?.office?.name || null,
      departmentName: f.user?.department?.name || null,
      tasks: parentTasks.map((t: any) => ({
        title: t.title,
        task_status: t.task_status || null,
        progress_rate: t.progress_rate,
        estimated_hours: t.estimated_hours,
        due_date: t.due_date,
        memo: t.memo || null,
        description: t.description || null,
        actual_url: t.actual_url || null,
        children: (childByParent.get(t.id) || []).map((c: any) => ({ title: c.title })),
      })),
      plannedTasks: plannedSorted.map((p: any) => ({ title: p.title })),
      nextDayPlanText: f.next_day_plan || null,
    })
  } catch (formatErr) {
    return NextResponse.json({
      mode: 'report',
      reportId,
      error: 'format_threw',
      detail: formatErr instanceof Error ? formatErr.message : String(formatErr),
      env,
    })
  }

  const result = await sendLineWorksMessage(message)

  return NextResponse.json({
    mode: 'report',
    reportId,
    message_length: message.length,
    message_preview: message.slice(0, 500),
    parent_task_count: parentTasks.length,
    child_total: allTasks.length - parentTasks.length,
    planned_count: plannedSorted.length,
    result,
    env,
  })
}
