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

    const body = await request.json()
    const { comment } = body

    // Fetch the extension request
    const { data: extReq, error: fetchError } = await supabase
      .from('deadline_extension_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '延長申請が見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (extReq.approver_id !== user.id) {
      return NextResponse.json({ error: 'この申請の承認者ではありません' }, { status: 403 })
    }

    if (extReq.status !== 'pending') {
      return NextResponse.json({ error: 'この申請は既に処理済みです' }, { status: 400 })
    }

    // Reject
    const { data, error: updateError } = await supabase
      .from('deadline_extension_requests')
      .update({
        status: 'rejected',
        approver_comment: comment?.trim() || null,
        acted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
