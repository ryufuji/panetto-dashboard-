import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const departmentId = searchParams.get('department_id')
    const officeId = searchParams.get('office_id')
    const role = searchParams.get('role')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('users')
      .select('*, department:departments!users_department_id_fkey(*), office:offices!users_office_id_fkey(*), report_reviewer:users!users_report_reviewer_id_fkey(id, name)')
      .order('name', { ascending: true })

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    if (officeId) {
      query = query.eq('office_id', officeId)
    }

    if (role) {
      query = query.eq('role', role)
    }

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
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
    const { user_id, employee_number, position, department_id, office_id, report_reviewer_id } = body

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = {}
    if (employee_number !== undefined) updates.employee_number = employee_number || null
    if (position !== undefined) updates.position = position || null
    if (department_id !== undefined) updates.department_id = (department_id === 'none' ? null : department_id) || null
    if (office_id !== undefined) updates.office_id = (office_id === 'none' ? null : office_id) || null
    if (report_reviewer_id !== undefined) updates.report_reviewer_id = (report_reviewer_id === 'none' ? null : report_reviewer_id) || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user_id)
      .select('*, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)')
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

async function getAdminContext(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: currentUser } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (currentUser?.role !== 'admin') return null

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  return { adminClient, organization_id: currentUser.organization_id }
}

async function createSingleUser(
  adminClient: any,
  organization_id: string,
  { email, password, name, employee_number, position, department_id, office_id, role }: any
) {
  const validRoles = ['admin', 'manager', 'employee']
  const userRole = validRoles.includes(role) ? role : 'employee'

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    return { data: null, error: authError.message }
  }

  const { data, error } = await adminClient
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      name,
      organization_id,
      employee_number: employee_number || null,
      position: position || null,
      department_id: (department_id && department_id !== 'none') ? department_id : null,
      office_id: (office_id && office_id !== 'none') ? office_id : null,
      role: userRole,
    })
    .select('*, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)')
    .single()

  if (error) {
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const ctx = await getAdminContext(supabase)

    if (!ctx) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const body = await request.json()

    // Bulk create (CSV import)
    if (Array.isArray(body.users)) {
      const results: { email: string; success: boolean; error?: string }[] = []

      for (const row of body.users) {
        if (!row.email || !row.password || !row.name) {
          results.push({ email: row.email || '(不明)', success: false, error: 'メール・パスワード・氏名は必須' })
          continue
        }
        const { error } = await createSingleUser(ctx.adminClient, ctx.organization_id, row)
        results.push({ email: row.email, success: !error, error: error || undefined })
      }

      const succeeded = results.filter((r) => r.success).length
      const failed = results.filter((r) => !r.success).length

      return NextResponse.json({ results, succeeded, failed }, { status: 201 })
    }

    // Single create
    const { email, password, name } = body
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'メールアドレス、パスワード、氏名は必須です' },
        { status: 400 }
      )
    }

    const { data, error } = await createSingleUser(ctx.adminClient, ctx.organization_id, body)
    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
