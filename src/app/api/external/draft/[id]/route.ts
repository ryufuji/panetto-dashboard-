/**
 * PATCH /api/external/draft/[id] — 既存の下書きを部分更新
 * DELETE /api/external/draft/[id] — 下書きを削除
 *
 * 認証: Authorization: Bearer <api_token>
 * 対象は自分の下書きのみ（status='draft' 以外は操作不可）
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function resolveUserByToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, organization_id, department_id')
    .eq('api_token', token)
    .maybeSingle()
  return user ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const supabase = await createClient()
  // 自分の下書きであることを確認
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
    const { error } = await supabase.from('reports').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(tasks)) {
    await supabase.from('report_tasks').delete().eq('report_id', id)
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]
      const { data: parentTask } = await supabase.from('report_tasks').insert({
        report_id: id,
        title: String(t.title || '').trim() || '(無題)',
        description: t.description ?? null,
        estimated_hours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
        progress_rate: t.progress_rate != null ? Math.min(100, Math.max(0, Number(t.progress_rate))) : 0,
        priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
        order_index: i,
        purpose: t.purpose ?? null,
        memo: t.memo ?? null,
        task_status: t.task_status ?? '未着手',
        is_recurring: !!t.is_recurring,
        recurrence_pattern: t.is_recurring ? (t.recurrence_pattern ?? 'daily') : null,
        no_norma: !!t.no_norma,
        due_date: t.due_date ?? null,
      }).select('id').single()

      if (parentTask && Array.isArray(t.children)) {
        for (let j = 0; j < t.children.length; j++) {
          const c = t.children[j]
          await supabase.from('report_tasks').insert({
            report_id: id,
            parent_task_id: parentTask.id,
            title: String(c.title || '').trim() || '(無題)',
            estimated_hours: c.estimated_hours != null ? Number(c.estimated_hours) : null,
            progress_rate: c.progress_rate != null ? Math.min(100, Math.max(0, Number(c.progress_rate))) : 0,
            priority: ['high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
            order_index: j,
            task_status: c.task_status ?? '未着手',
            memo: c.memo ?? null,
          })
        }
      }
    }
  }

  if (Array.isArray(planned_tasks)) {
    await supabase.from('report_planned_tasks').delete().eq('report_id', id)
    if (planned_tasks.length > 0) {
      await supabase.from('report_planned_tasks').insert(
        planned_tasks.map((p: any, idx: number) => ({
          report_id: id,
          title: String(p.title || '').trim() || '(無題)',
          estimated_hours: p.estimated_hours != null ? Number(p.estimated_hours) : null,
          order_index: idx,
        }))
      )
    }
  }

  return NextResponse.json({ ok: true, report_id: id })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const supabase = await createClient()
  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'draft')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
