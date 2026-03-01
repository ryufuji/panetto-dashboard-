import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!currentUser?.organization_id) {
      return NextResponse.json(
        { error: '組織情報が見つかりません' },
        { status: 404 }
      )
    }

    const { data, error } = await supabase
      .from('departments')
      .select('*, manager:users!fk_departments_manager(name)')
      .eq('organization_id', currentUser.organization_id)
      .order('order_index')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (currentUser?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, code, description, manager_id, parent_department_id, order_index } = body

    if (!name || !code) {
      return NextResponse.json(
        { error: '部署名とコードは必須です' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('departments')
      .insert({
        name,
        code,
        description: description || null,
        manager_id: (manager_id && manager_id !== 'none') ? manager_id : null,
        parent_department_id: (parent_department_id && parent_department_id !== 'none') ? parent_department_id : null,
        order_index: order_index ?? 0,
        organization_id: currentUser.organization_id,
      })
      .select('*, manager:users!fk_departments_manager(name)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (currentUser?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, name, code, description, manager_id, parent_department_id, order_index, is_active } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = {}
    if (name !== undefined) updates.name = name
    if (code !== undefined) updates.code = code
    if (description !== undefined) updates.description = description || null
    if (manager_id !== undefined) updates.manager_id = (manager_id === 'none' ? null : manager_id) || null
    if (parent_department_id !== undefined) updates.parent_department_id = (parent_department_id === 'none' ? null : parent_department_id) || null
    if (order_index !== undefined) updates.order_index = order_index
    if (is_active !== undefined) updates.is_active = is_active

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('departments')
      .update(updates)
      .eq('id', id)
      .select('*, manager:users!fk_departments_manager(name)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
