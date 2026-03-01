import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const comment = body?.comment

    // Fetch request
    const { data: approvalReq, error: fetchError } = await supabase
      .from('approval_requests')
      .select('requester_id, status')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (approvalReq.requester_id !== user.id) {
      return NextResponse.json({ error: '自分の申請のみ取消できます' }, { status: 403 })
    }

    if (approvalReq.status !== 'pending') {
      return NextResponse.json({ error: '承認待ち状態の申請のみ取消できます' }, { status: 400 })
    }

    const { data, error: updateError } = await supabase
      .from('approval_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Record history
    await supabase.from('approval_request_history').insert({
      request_id: id,
      action: 'cancelled',
      actor_id: user.id,
      comment: comment?.trim() || null,
    })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
