import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const assigneeId = searchParams.get('assignee_id')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const perPage = parseInt(searchParams.get('per_page') || '20', 10)

    const offset = (page - 1) * perPage

    let query = supabase
      .from('approvals')
      .select(
        '*, report:reports(*, user:users(*)), assignee:users!approvals_assignee_id_fkey(*), requester:users!approvals_requester_id_fkey(*)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (assigneeId) {
      query = query.eq('assignee_id', assigneeId)
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
