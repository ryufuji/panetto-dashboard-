import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const tab = searchParams.get('tab') // 'mine' | 'pending_approval' | null (all)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    let query = supabase
      .from('approval_requests')
      .select(
        '*, requester:users!approval_requests_requester_id_fkey(id, name, avatar_url), steps:approval_request_steps(id, step_number, approver_id, status, approver:users!approval_request_steps_approver_id_fkey(id, name))',
        { count: 'exact' }
      )
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (tab === 'mine') {
      query = query.eq('requester_id', user.id)
    } else if (tab === 'pending_approval') {
      // Filter to requests where user is the approver of the current pending step
      const { data: pendingSteps } = await supabase
        .from('approval_request_steps')
        .select('request_id')
        .eq('approver_id', user.id)
        .eq('status', 'pending')

      const requestIds = pendingSteps?.map(s => s.request_id) || []
      if (requestIds.length === 0) {
        return NextResponse.json({ data: [], pagination: { page, per_page: limit, total: 0, total_pages: 0 } })
      }
      query = query.in('id', requestIds).eq('status', 'pending')
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // For pending_approval tab, filter to only requests where user is approver of the *current* step
    let filtered = data
    if (tab === 'pending_approval' && data) {
      filtered = data.filter((req: any) => {
        const currentStep = req.steps?.find(
          (s: any) => s.step_number === req.current_step && s.approver_id === user.id && s.status === 'pending'
        )
        return !!currentStep
      })
    }

    const total = count || 0
    return NextResponse.json({
      data: filtered,
      pagination: {
        page,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { title, description, category, custom_category, amount, report_task_id, file_url, equipment_purpose, equipment_user } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })
    }

    const validCategories = ['equipment_purchase', 'document_review', 'other']
    if (!category || !validCategories.includes(category)) {
      return NextResponse.json({ error: 'カテゴリが不正です' }, { status: 400 })
    }

    if (category === 'other' && !custom_category?.trim()) {
      return NextResponse.json({ error: 'カテゴリが「その他」の場合、カテゴリ名を入力してください' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('approval_requests')
      .insert({
        organization_id: profile.organization_id,
        requester_id: user.id,
        title: title.trim(),
        description: description?.trim() || null,
        category,
        custom_category: category === 'other' ? custom_category?.trim() : null,
        amount: amount != null ? Number(amount) : null,
        report_task_id: report_task_id || null,
        file_url: file_url?.trim() || null,
        equipment_purpose: category === 'equipment_purchase' ? equipment_purpose?.trim() || null : null,
        equipment_user: category === 'equipment_purchase' ? equipment_user?.trim() || null : null,
        status: 'draft',
        current_step: 0,
        total_steps: 1,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Record history
    await supabase.from('approval_request_history').insert({
      request_id: data.id,
      action: 'created',
      actor_id: user.id,
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
