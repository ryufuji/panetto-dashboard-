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

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Fetch the request
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

    if (approvalReq.requester_id !== user.id) {
      return NextResponse.json({ error: '自分の申請のみ提出できます' }, { status: 403 })
    }

    if (approvalReq.status !== 'draft') {
      return NextResponse.json({ error: '下書き状態の申請のみ提出できます' }, { status: 400 })
    }

    // Parse body for approvers
    const body = await request.json()
    const { approvers } = body // Array of user IDs in step order

    if (!approvers || !Array.isArray(approvers) || approvers.length === 0) {
      return NextResponse.json({ error: '承認者を1人以上選択してください' }, { status: 400 })
    }

    // Determine required steps based on amount thresholds
    let requiredSteps = 1

    if (approvalReq.amount != null) {
      const { data: rules } = await supabase
        .from('approval_threshold_rules')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('min_amount', { ascending: true })

      if (rules && rules.length > 0) {
        for (const rule of rules) {
          const amount = Number(approvalReq.amount)
          const minOk = amount >= Number(rule.min_amount)
          const maxOk = rule.max_amount == null || amount < Number(rule.max_amount)
          if (minOk && maxOk) {
            requiredSteps = rule.required_steps
            break
          }
        }
      }
    }

    // Validate approvers count matches required steps
    if (approvers.length < requiredSteps) {
      return NextResponse.json(
        { error: `この金額には${requiredSteps}段階の承認が必要です。承認者を${requiredSteps}人以上選択してください` },
        { status: 400 }
      )
    }

    const totalSteps = approvers.length

    // Create approval steps
    const stepsToInsert = approvers.map((approverId: string, index: number) => ({
      request_id: id,
      step_number: index + 1,
      approver_id: approverId,
      status: 'pending',
    }))

    const { error: stepsError } = await supabase
      .from('approval_request_steps')
      .insert(stepsToInsert)

    if (stepsError) {
      return NextResponse.json({ error: stepsError.message }, { status: 500 })
    }

    // Update request status
    const { data, error: updateError } = await supabase
      .from('approval_requests')
      .update({
        status: 'pending',
        current_step: 1,
        total_steps: totalSteps,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Record history
    await supabase.from('approval_request_history').insert({
      request_id: id,
      action: 'submitted',
      actor_id: user.id,
    })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
