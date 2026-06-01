/**
 * タスクテンプレート 個別操作
 * GET    /api/organization/task-templates/[id]  – 詳細取得
 * PUT    /api/organization/task-templates/[id]  – 更新（admin のみ）
 * DELETE /api/organization/task-templates/[id]  – 削除（admin のみ）
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function getAdminProfile(supabase: any) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('users').select('organization_id, role').eq('id', user.id).single()
  return profile ? { user, profile } : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await getAdminProfile(supabase)
  if (!ctx) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const { data: tmpl, error } = await supabase
    .from('report_task_templates')
    .select('*')
    .eq('id', id)
    .eq('organization_id', (ctx.profile as any).organization_id)
    .single()
  if (error || !tmpl) return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 })

  const { data: items } = await supabase
    .from('report_task_template_items')
    .select('*')
    .eq('template_id', id)
    .order('order_index')

  return NextResponse.json({ data: { ...tmpl, items: items || [] } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await getAdminProfile(supabase)
  if (!ctx) return NextResponse.json({ error: '認証エラー' }, { status: 401 })
  if ((ctx.profile as any).role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ編集できます' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, items } = body
  if (!name?.trim()) return NextResponse.json({ error: 'テンプレート名は必須です' }, { status: 400 })

  const { error: updErr } = await supabase
    .from('report_task_templates')
    .update({ name: name.trim(), description: description?.trim() || null })
    .eq('id', id)
    .eq('organization_id', (ctx.profile as any).organization_id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // アイテムは全件入れ替え
  await supabase.from('report_task_template_items').delete().eq('template_id', id)

  if (Array.isArray(items) && items.length > 0) {
    const idMap = new Map<string, string>()
    const sorted = [...items].sort((a, b) => (a.parentTempId ? 1 : -1))
    for (const item of sorted) {
      const { data: ins } = await supabase
        .from('report_task_template_items')
        .insert({
          template_id: id,
          parent_item_id: item.parentTempId ? (idMap.get(item.parentTempId) || null) : null,
          title: item.title?.trim() || '',
          estimated_hours: item.estimatedHours ? Number(item.estimatedHours) : null,
          order_index: item.orderIndex ?? 0,
          task_type: item.taskType || null,
          priority: item.priority || 'medium',
          purpose: item.purpose?.trim() || null,
          memo: item.memo?.trim() || null,
        })
        .select('id')
        .single()
      if (ins) idMap.set(item.tempId, (ins as any).id)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const ctx = await getAdminProfile(supabase)
  if (!ctx) return NextResponse.json({ error: '認証エラー' }, { status: 401 })
  if ((ctx.profile as any).role !== 'admin') {
    return NextResponse.json({ error: '管理者のみ削除できます' }, { status: 403 })
  }

  const { error } = await supabase
    .from('report_task_templates')
    .delete()
    .eq('id', id)
    .eq('organization_id', (ctx.profile as any).organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
