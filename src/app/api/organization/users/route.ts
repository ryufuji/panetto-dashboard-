import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createPanetUser } from '@/lib/panet'

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
      .select('*, department:departments!users_department_id_fkey(*), office:offices!users_office_id_fkey(*)')
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
    const ctx = await getAdminContext(supabase)

    if (!ctx) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const body = await request.json()
    const { user_id, employee_number, position, department_id, office_id, report_reviewer_id, monthly_salary } = body

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
    if (monthly_salary !== undefined) updates.monthly_salary = monthly_salary != null && monthly_salary !== '' ? Number(monthly_salary) : null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // RLS を回避するため service role クライアントで更新。同組織内に限定してセーフガード。
    const { data, error } = await ctx.adminClient
      .from('users')
      .update(updates)
      .eq('id', user_id)
      .eq('organization_id', ctx.organization_id)
      .select('*, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 双方向同期: department / position の変更を panet に送信 (Phase 2)
    if (data?.panet_user_id && (updates.position !== undefined || updates.department_id !== undefined)) {
      const fields: Record<string, string | null> = {}
      if (updates.position !== undefined) fields.position = updates.position
      if (updates.department_id !== undefined) {
        // department_id (UUID) を department name (TEXT) に変換して送信
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deptName = (data as any).department?.name || null
        fields.department = deptName
      }
      // fire-and-forget (失敗しても本処理は止めない)
      const { notifyPanetInbound } = await import('@/lib/panet-inbound')
      notifyPanetInbound(data.panet_user_id, fields).catch((e) =>
        console.error('[PATCH users] panet inbound notify failed:', e)
      )
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

function computeJoinYear(hireDate: string | null | undefined): number | undefined {
  if (!hireDate) return undefined
  const hd = new Date(hireDate)
  if (isNaN(hd.getTime())) return undefined
  const month = hd.getMonth() + 1
  const year = hd.getFullYear()
  // 日本の会計年度: 4月始まり → 1-3月入社は前年度
  return month >= 4 ? year : year - 1
}

async function createSingleUser(
  adminClient: any,
  organization_id: string,
  { email, password, name, employee_number, position, department_id, office_id, role, hire_date }: any,
  departmentName?: string
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
      hire_date: hire_date || null,
    })
    .select('*, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)')
    .single()

  if (error) {
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { data: null, error: error.message }
  }

  // Also create PANET account (fire-and-forget — failure does not block panetto-dashboard)
  try {
    const panetResult = await createPanetUser({
      email,
      display_name: name,
      department: departmentName || data?.department?.name || undefined,
      join_year: computeJoinYear(hire_date),
    })
    if (panetResult) {
      console.log(`[PANET] Account ${panetResult.created ? 'created' : 'already existed'} for ${email}`)
    }
  } catch (err) {
    console.error(`[PANET] Failed to create account for ${email}:`, err)
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
