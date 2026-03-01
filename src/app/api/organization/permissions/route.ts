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

    const [usersRes, permissionsRes] = await Promise.all([
      supabase
        .from('users')
        .select(
          '*, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)'
        )
        .eq('is_active', true)
        .order('name'),
      supabase.from('user_permissions').select('*'),
    ])

    if (usersRes.error) {
      return NextResponse.json(
        { error: usersRes.error.message },
        { status: 500 }
      )
    }
    if (permissionsRes.error) {
      return NextResponse.json(
        { error: permissionsRes.error.message },
        { status: 500 }
      )
    }

    const permissionsByUser: Record<string, string[]> = {}
    for (const p of permissionsRes.data) {
      if (!permissionsByUser[p.user_id]) {
        permissionsByUser[p.user_id] = []
      }
      permissionsByUser[p.user_id].push(p.permission)
    }

    const data = usersRes.data.map((u: any) => ({
      ...u,
      permissions: permissionsByUser[u.id] || [],
    }))

    return NextResponse.json({ data })
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
    const { user_id, role } = body

    if (!user_id || !role) {
      return NextResponse.json(
        { error: 'user_id and role are required' },
        { status: 400 }
      )
    }

    const validRoles = ['admin', 'manager', 'employee']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', user_id)
      .select()
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
