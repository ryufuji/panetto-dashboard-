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
 *   - 初回提出（lineworks_notified_at 無し）は送る
 *   - 提出済みを編集して再提出（submitted_at が前回通知より後）は「再提出」として送る
 *   - 同じ提出に対する二重呼び出しはスキップ
 *   - 送信成功時、lineworks_notified_at を「現在時刻と submitted_at の遅い方」に記録
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
        'user:users(name, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)), ' +
        'tasks:report_tasks(id, title, description, memo, purpose, actual_url, task_status, progress_rate, priority, estimated_hours, actual_hours, due_date, parent_task_id, order_index)'
      )
      .eq('id', id)
      .single()

    if (error || !report) {
      console.error('[NOTIFY] Report fetch failed:', { id, error: error?.message, code: error?.code })
      return NextResponse.json({ error: 'Report not found', detail: error?.message }, { status: 404 })
    }

    // PostgREST のスキーマキャッシュ問題で reports → report_planned_tasks の
    // 埋め込み select が動かないため、別クエリで取得する
    const { data: plannedRows } = await admin
      .from('report_planned_tasks')
      .select('title, order_index')
      .eq('report_id', id)
      .order('order_index', { ascending: true })

    // 本人のみ（権限チェック）
    if ((report as any).user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 提出状態でなければ送らない
    if ((report as any).status !== 'submitted') {
      return NextResponse.json({ skipped: 'not_submitted' })
    }

    // 冪等性: 「最後の通知より後に提出されていれば送る」。
    //   - 初回提出: lineworks_notified_at が無い → 送る
    //   - 提出済みを編集して再提出: submitted_at が更新され通知時刻より後 → 「再提出」として送る
    //   - 同じ提出に対する二重呼び出し: submitted_at <= 通知時刻 → スキップ
    // submitted_at はクライアント時計で設定されるため、送信後の lineworks_notified_at は
    // 「サーバー現在時刻」と「submitted_at」の遅い方に揃え、時計ズレで二重送信されないようにする。
    const notifiedAtMs = (report as any).lineworks_notified_at ? new Date((report as any).lineworks_notified_at).getTime() : 0
    const submittedAtMs = (report as any).submitted_at ? new Date((report as any).submitted_at).getTime() : 0
    const isResubmit = notifiedAtMs > 0
    if (isResubmit && submittedAtMs <= notifiedAtMs + 5_000) {
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

    // 別クエリで取得した planned_tasks を使う (上で取得済みで既に order_index 昇順)
    const plannedSorted = plannedRows || []

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
        purpose: t.purpose || null,
        description: t.description || null,
        actual_url: t.actual_url || null,
        children: (childByParent.get(t.id) || []).map((c: any) => ({ title: c.title })),
      })),
      plannedTasks: plannedSorted.map((p: any) => ({ title: p.title })),
      nextDayPlanText: f.next_day_plan || null,
      isResubmit,
    })

    console.log(`[NOTIFY] Sending ${isResubmit ? 'RESUBMIT ' : ''}message (length=${message.length}) for report ${id}`)
    const result = await sendLineWorksMessage(message)

    // 送信成功時にタイムスタンプ記録（再送防止）
    if (result.ok) {
      await admin
        .from('reports')
        .update({ lineworks_notified_at: new Date(Math.max(Date.now(), submittedAtMs)).toISOString() })
        .eq('id', id)
      console.log(`[NOTIFY] Sent successfully for report ${id}`)
    } else {
      console.error(`[NOTIFY] Send failed for report ${id}:`, result)
    }

    return NextResponse.json({ success: result.ok, status: result.status, error: result.error, resubmit: isResubmit })
  } catch (err) {
    console.error('[NOTIFY] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
