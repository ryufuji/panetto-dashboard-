/**
 * PATCH  /api/external/draft/[id] — 既存の下書きを部分更新
 * DELETE /api/external/draft/[id] — 下書きを削除
 *
 * 認証: Authorization: Bearer <api_token>
 * 対象は自分の下書きのみ（status='draft' 以外は操作不可）
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveUserByToken, createExternalClient, insertTasksForReport } from '@/lib/external-api'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const supabase = createExternalClient()

  // 所有確認（自分のdraftのみ）
  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: '下書きが見つかりません（自分の下書きのみ更新可能）' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSONが不正です' }, { status: 400 }) }

  const { title, start_time, end_time, work_hours, next_day_plan, tasks, planned_tasks } = body
  const patch: Record<string, any> = {}
  if (title !== undefined) patch.title = title
  if (start_time !== undefined) patch.start_time = start_time
  if (end_time !== undefined) patch.end_time = end_time
  if (work_hours !== undefined) patch.work_hours = Number(work_hours)
  if (next_day_plan !== undefined) patch.next_day_plan = next_day_plan

  if (Object.keys(patch).length > 0) {
    // user_id + status を明示的に絞り込み、所有確認とUPDATEを一体化
    const { error } = await supabase
      .from('reports')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'draft')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(tasks)) {
    const { error: delErr } = await supabase.from('report_tasks').delete().eq('report_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (tasks.length > 0) {
      const err = await insertTasksForReport(supabase, id, tasks)
      if (err) return NextResponse.json({ error: `タスクの保存に失敗しました: ${err}` }, { status: 500 })
    }
  }

  if (Array.isArray(planned_tasks)) {
    const { error: delErr } = await supabase.from('report_planned_tasks').delete().eq('report_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (planned_tasks.length > 0) {
      const { error: insErr } = await supabase.from('report_planned_tasks').insert(
        planned_tasks.map((p: any, idx: number) => ({
          report_id: id,
          title: String(p.title || '').trim() || '(無題)',
          estimated_hours: p.estimated_hours != null ? Number(p.estimated_hours) : null,
          order_index: idx,
        }))
      )
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, report_id: id })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const supabase = createExternalClient()
  const { error, count } = await supabase
    .from('reports')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'draft')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: '下書きが見つかりません（既に削除済みか提出済みの可能性があります）' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
