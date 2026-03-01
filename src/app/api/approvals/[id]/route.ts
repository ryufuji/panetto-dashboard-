import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('approvals')
      .select(
        '*, report:reports(*, user:users(*), tasks:report_tasks(*)), assignee:users!approvals_assignee_id_fkey(*), requester:users!approvals_requester_id_fkey(*)'
      )
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Approval not found' },
          { status: 404 }
        )
      }
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { status, comment } = body

    const validStatuses = ['approved', 'rejected']
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const { data: approval, error: fetchError } = await supabase
      .from('approvals')
      .select('report_id, status')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Approval not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const previousStatus = approval.status

    const { data, error: updateError } = await supabase
      .from('approvals')
      .update({
        status,
        comment,
        responded_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { error: historyError } = await supabase
      .from('approval_history')
      .insert({
        approval_id: id,
        user_id: user.id,
        action: status,
        comment,
        previous_status: previousStatus,
        new_status: status,
      })

    if (historyError) {
      return NextResponse.json(
        { error: historyError.message },
        { status: 500 }
      )
    }

    const reportStatus = status === 'approved' ? 'approved' : 'rejected'
    const { error: reportError } = await supabase
      .from('reports')
      .update({ status: reportStatus })
      .eq('id', approval.report_id)

    if (reportError) {
      return NextResponse.json(
        { error: reportError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
