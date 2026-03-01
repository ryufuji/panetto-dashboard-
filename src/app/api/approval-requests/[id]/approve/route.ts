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

    // Fetch request
    const { data: approvalReq, error: fetchError } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (approvalReq.status !== 'pending') {
      return NextResponse.json({ error: 'この申請は承認待ち状態ではありません' }, { status: 400 })
    }

    // Get current step
    const { data: currentStep, error: stepError } = await supabase
      .from('approval_request_steps')
      .select('*')
      .eq('request_id', id)
      .eq('step_number', approvalReq.current_step)
      .single()

    if (stepError) {
      return NextResponse.json({ error: stepError.message }, { status: 500 })
    }

    if (currentStep.approver_id !== user.id) {
      return NextResponse.json({ error: 'このステップの承認者ではありません' }, { status: 403 })
    }

    if (currentStep.status !== 'pending') {
      return NextResponse.json({ error: 'このステップは既に処理済みです' }, { status: 400 })
    }

    // Approve the current step
    const { error: updateStepError } = await supabase
      .from('approval_request_steps')
      .update({
        status: 'approved',
        comment: comment?.trim() || null,
        acted_at: new Date().toISOString(),
      })
      .eq('id', currentStep.id)

    if (updateStepError) {
      return NextResponse.json({ error: updateStepError.message }, { status: 500 })
    }

    // Check if all steps are done
    const isLastStep = approvalReq.current_step >= approvalReq.total_steps

    let requestUpdate: Record<string, unknown>
    if (isLastStep) {
      requestUpdate = { status: 'approved' }
    } else {
      requestUpdate = { current_step: approvalReq.current_step + 1 }
    }

    const { data, error: updateError } = await supabase
      .from('approval_requests')
      .update(requestUpdate)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Record history
    await supabase.from('approval_request_history').insert({
      request_id: id,
      action: 'approved',
      actor_id: user.id,
      step_number: approvalReq.current_step,
      comment: comment?.trim() || null,
    })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
