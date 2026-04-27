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
        'id, user_id, status, report_date, title, work_hours, progress_rate, next_day_plan, lineworks_notified_at, ' +
        'user:users(name, department:departments!users_department_id_fkey(name)), ' +
        'tasks:report_tasks(title, status)'
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
    const message = formatReportSubmittedMessage({
      reportId: f.id,
      userName: f.user?.name || '不明',
      reportDate: f.report_date,
      departmentName: f.user?.department?.name || null,
      workHours: f.work_hours ?? null,
      progressRate: f.progress_rate ?? null,
      title: f.title || null,
      tasks: (f.tasks || []).map((t: { title: string; status?: string }) => ({
        title: t.title,
        status: t.status,
      })),
      nextDayPlan: f.next_day_plan || null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
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
