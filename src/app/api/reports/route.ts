import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const userId = searchParams.get('user_id')
    const departmentId = searchParams.get('department_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const perPage = parseInt(searchParams.get('per_page') || '20', 10)

    const offset = (page - 1) * perPage

    let query = supabase
      .from('reports')
      .select('*, user:users(*), department:departments(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    if (dateFrom) {
      query = query.gte('report_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('report_date', dateTo)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,next_day_plan.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        per_page: perPage,
        total: count ?? 0,
        total_pages: count ? Math.ceil(count / perPage) : 0,
      },
    })
  } catch (err) {
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

    const body = await request.json()
    const { report_date, title, next_day_plan, department_id, work_hours, progress_rate, status = 'draft' } = body

    if (!report_date) {
      return NextResponse.json(
        { error: 'report_date is required' },
        { status: 400 }
      )
    }

    // Get user's org_id for the report
    const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single()

    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        organization_id: profile?.organization_id,
        user_id: user.id,
        report_date,
        title,
        next_day_plan,
        department_id,
        work_hours,
        progress_rate,
        status,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: report }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
