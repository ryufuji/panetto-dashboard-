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
    const { delegatee_id, comment } = body

    if (!delegatee_id) {
      return NextResponse.json({ error: '委任先ユーザーを選択してください' }, { status: 400 })
    }

    if (delegatee_id === user.id) {
      return NextResponse.json({ error: '自分自身には委任できません' }, { status: 400 })
    }

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

    // Mark current step as delegated
    const { error: updateStepError } = await supabase
      .from('approval_request_steps')
      .update({
        status: 'delegated',
        comment: comment?.trim() || null,
        acted_at: new Date().toISOString(),
      })
      .eq('id', currentStep.id)

    if (updateStepError) {
      return NextResponse.json({ error: updateStepError.message }, { status: 500 })
    }

    // Shift subsequent steps' step_number by +1 (update from largest to smallest to avoid UNIQUE constraint)
    const { data: laterSteps } = await supabase
      .from('approval_request_steps')
      .select('id, step_number')
      .eq('request_id', id)
      .gt('step_number', approvalReq.current_step)
      .order('step_number', { ascending: false })

    if (laterSteps && laterSteps.length > 0) {
      for (const step of laterSteps) {
        const { error: shiftError } = await supabase
          .from('approval_request_steps')
          .update({ step_number: step.step_number + 1 })
          .eq('id', step.id)

        if (shiftError) {
          return NextResponse.json({ error: shiftError.message }, { status: 500 })
        }
      }
    }

    // Insert new step for the delegatee at current_step + 1
    const { error: insertStepError } = await supabase
      .from('approval_request_steps')
      .insert({
        request_id: id,
        step_number: approvalReq.current_step + 1,
        approver_id: delegatee_id,
        status: 'pending',
      })

    if (insertStepError) {
      return NextResponse.json({ error: insertStepError.message }, { status: 500 })
    }

    // Update the request: total_steps +1, current_step +1
    const { data, error: updateError } = await supabase
      .from('approval_requests')
      .update({
        total_steps: approvalReq.total_steps + 1,
        current_step: approvalReq.current_step + 1,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Get delegatee name for history comment
    const { data: delegatee } = await supabase
      .from('users')
      .select('name')
      .eq('id', delegatee_id)
      .single()

    const delegateeName = delegatee?.name || '不明'
    const historyComment = comment?.trim()
      ? `${delegateeName} に委任。${comment.trim()}`
      : `${delegateeName} に委任`

    // Record history
    await supabase.from('approval_request_history').insert({
      request_id: id,
      action: 'delegated',
      actor_id: user.id,
      step_number: approvalReq.current_step,
      comment: historyComment,
    })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
