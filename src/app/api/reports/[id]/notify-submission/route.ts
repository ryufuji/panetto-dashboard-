/**
 * 日報提出時にLINE Works通知を発火するエンドポイント。
 * 新規作成/編集ページがクライアントから直接Supabaseを叩いて提出する場合、
 * PUT /api/reports/[id] のフックを通らないため、こちらを明示的に呼ぶ必要がある。
 *
 * 認可:
 *   - ログイン必須
 *   - 報告者本人のみ呼び出し可（不正発火・スパム防止）
 *
 * 冪等性:
 *   - reports.lineworks_notified_at をチェックし、未送信の場合のみ発火
 *   - 送信成功時にタイムスタンプを記録（再送防止）
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendLineWorksMessage, formatReportSubmittedMessage } from '@/lib/lineworks'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 認証はユーザーセッションで実施
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 通知用のレポート取得は Service Role を使う(RLSやJOINの組み合わせで
    // 直後のINSERTが見えないケースを回避。読み取り後にuser.idで権限チェック)
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: report, error } = await admin
      .from('reports')
      .select(
        'id, user_id, status, report_date, title, work_hours, progress_rate, next_day_plan, ' +
        'start_time, end_time, submitted_at, lineworks_notified_at, ' +
        'user:users(name, department:departments!users_department_id_fkey(name), office:offices(name)), ' +
        'tasks:report_tasks(id, title, description, memo, actual_url, task_status, progress_rate, priority, estimated_hours, actual_hours, due_date, parent_task_id, order_index), ' +
        'planned_tasks:report_planned_tasks(title, order_index)'
      )
      .eq('id', id)
      .single()

    if (error || !report) {
      console.error('[NOTIFY] Report fetch failed:', { id, error: error?.message, code: error?.code })
      return NextResponse.json({ error: 'Report not found', detail: error?.message }, { status: 404 })
    }

    // 本人のみ（権限チェック）
    if ((report as any).user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 提出状態でなければ送らない
    if ((report as any).status !== 'submitted') {
      return NextResponse.json({ skipped: 'not_submitted' })
    }

    // 既に通知済みなら送らない（重複防止）
    if ((report as any).lineworks_notified_at) {
      return NextResponse.json({ skipped: 'already_notified' })
    }

    const f = report as any
    // タスクを親 / 子に分類して、各親に子配列を付与
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTasks: any[] = f.tasks || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedSorted = ((f.planned_tasks || []) as any[])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))

    const message = formatReportSubmittedMessage({
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

    const result = await sendLineWorksMessage(message)

    // 送信成功時にタイムスタンプ記録（再送防止）
    if (result.ok) {
      await admin
        .from('reports')
        .update({ lineworks_notified_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({ success: result.ok, status: result.status, error: result.error })
  } catch (err) {
    console.error('[NOTIFY] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
