/**
 * タスクテンプレート API
 * GET  /api/organization/task-templates        – 一覧（同組織ユーザー全員）
 * POST /api/organization/task-templates        – 作成（admin のみ）
 */
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('organization_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'ユーザー情報が見つかりません' }, { status: 404 })

  const { data: templates, error } = await supabase
    .from('report_task_templates')
    .select('id, name, description, created_by, created_at, updated_at')
    .eq('organization_id', (profile as any).organization_id)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 各テンプレートのアイテムも取得
  const templateIds = (templates || []).map((t: any) => t.id)
  let itemsMap: Record<string, any[]> = {}
  if (templateIds.length > 0) {
    const { data: items } = await supabase
      .from('report_task_template_items')
      .select('*')
      .in('template_id', templateIds)
      .order('order_index')
    ;(items || []).forEach((item: any) => {
      if (!itemsMap[item.template_id]) itemsMap[item.template_id] = []
      itemsMap[item.template_id].push(item)
    })
  }

  const result = (templates || []).map((t: any) => ({
    ...t,
    items: itemsMap[t.id] || [],
  }))

  return NextResponse.json({ data: result })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: '認証エラー' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('organization_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'ユーザー情報が見つかりません' }, { status: 404 })
  if ((profile as any).role !== 'admin') {
    return NextResponse.json({ error: 'テンプレートの作成は管理者のみ可能です' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, items } = body
  if (!name?.trim()) return NextResponse.json({ error: 'テンプレート名は必須です' }, { status: 400 })
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'タスクを1件以上追加してください' }, { status: 400 })
  }

  // テンプレート本体を作成
  const { data: tmpl, error: tmplErr } = await supabase
    .from('report_task_templates')
    .insert({
      organization_id: (profile as any).organization_id,
      name: name.trim(),
      description: description?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()
  if (tmplErr || !tmpl) return NextResponse.json({ error: tmplErr?.message || '作成失敗' }, { status: 500 })

  // アイテム挿入（親→子の順で、parent_item_id を解決）
  // items: [{ tempId, title, estimatedHours, taskType, priority, purpose, memo, orderIndex, parentTempId? }]
  const idMap = new Map<string, string>() // tempId → db uuid
  const toInsert = [...items].sort((a, b) => (a.parentTempId ? 1 : -1)) // 親を先に

  for (const item of toInsert) {
    const { data: inserted, error: iErr } = await supabase
      .from('report_task_template_items')
      .insert({
        template_id: (tmpl as any).id,
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
    if (iErr || !inserted) {
      // ロールバック（cascade で items も消える）
      await supabase.from('report_task_templates').delete().eq('id', (tmpl as any).id)
      return NextResponse.json({ error: iErr?.message || 'アイテム作成失敗' }, { status: 500 })
    }
    idMap.set(item.tempId, (inserted as any).id)
  }

  return NextResponse.json({ data: tmpl }, { status: 201 })
}
