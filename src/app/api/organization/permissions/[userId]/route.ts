import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId)

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
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
    const { permissions } = body as { permissions: string[] }

    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'permissions must be an array of strings' },
        { status: 400 }
      )
    }

    // Get current permissions
    const { data: existing, error: fetchError } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', userId)

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      )
    }

    const currentPerms = (existing || []).map((p: any) => p.permission)
    const toAdd = permissions.filter((p) => !currentPerms.includes(p))
    const toRemove = currentPerms.filter((p: string) => !permissions.includes(p))

    // Remove revoked permissions
    if (toRemove.length > 0) {
      const { error: delError } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .in('permission', toRemove)

      if (delError) {
        return NextResponse.json(
          { error: delError.message },
          { status: 500 }
        )
      }
    }

    // Add new permissions
    if (toAdd.length > 0) {
      const { error: insError } = await supabase
        .from('user_permissions')
        .insert(
          toAdd.map((p) => ({
            user_id: userId,
            permission: p,
            granted_by: user.id,
          }))
        )

      if (insError) {
        return NextResponse.json(
          { error: insError.message },
          { status: 500 }
        )
      }
    }

    // Return updated list
    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId)

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
