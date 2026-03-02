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
      .from('approval_requests')
      .select(
        '*, requester:users!approval_requests_requester_id_fkey(id, name, avatar_url, email, department:departments!users_department_id_fkey(name)), steps:approval_request_steps(*, approver:users!approval_request_steps_approver_id_fkey(id, name, avatar_url)), attachments:approval_request_attachments(*, uploader:users!approval_request_attachments_uploaded_by_fkey(id, name)), history:approval_request_history(*, actor:users!approval_request_history_actor_id_fkey(id, name, avatar_url)), report_task:report_tasks!approval_requests_report_task_id_fkey(id, title, report_id)'
      )
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort steps by step_number and history by created_at
    if (data.steps) {
      data.steps.sort((a: any, b: any) => a.step_number - b.step_number)
    }
    if (data.history) {
      data.history.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
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

    // Only allow update of draft requests by the requester
    const { data: existing, error: fetchError } = await supabase
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

    if (existing.requester_id !== user.id) {
      return NextResponse.json({ error: '自分の申請のみ編集できます' }, { status: 403 })
    }

    if (existing.status !== 'draft') {
      return NextResponse.json({ error: '下書き状態の申請のみ編集できます' }, { status: 400 })
    }

    const body = await request.json()
    const { title, description, category, custom_category, amount, file_url, equipment_purpose, equipment_user } = body

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (category !== undefined) updateData.category = category
    if (custom_category !== undefined) updateData.custom_category = category === 'other' ? custom_category?.trim() : null
    if (amount !== undefined) updateData.amount = amount != null ? Number(amount) : null
    if (file_url !== undefined) updateData.file_url = file_url?.trim() || null
    if (equipment_purpose !== undefined) updateData.equipment_purpose = category === 'equipment_purchase' ? equipment_purpose?.trim() || null : null
    if (equipment_user !== undefined) updateData.equipment_user = category === 'equipment_purchase' ? equipment_user?.trim() || null : null

    const { data, error } = await supabase
      .from('approval_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    const { data: existing, error: fetchError } = await supabase
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

    if (existing.requester_id !== user.id) {
      return NextResponse.json({ error: '自分の申請のみ削除できます' }, { status: 403 })
    }

    if (existing.status !== 'draft') {
      return NextResponse.json({ error: '下書き状態の申請のみ削除できます' }, { status: 400 })
    }

    const { error } = await supabase
      .from('approval_requests')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
