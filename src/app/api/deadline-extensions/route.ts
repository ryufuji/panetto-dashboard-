import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { report_task_id, approver_id, proposed_due_date, reason } = body

    if (!report_task_id || !approver_id || !proposed_due_date) {
      return NextResponse.json({ error: 'report_task_id, approver_id, proposed_due_date は必須です' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'ユーザー情報が取得できません' }, { status: 400 })
    }

    // Fetch the task to get original_due_date and report_id
    const { data: task, error: taskError } = await supabase
      .from('report_tasks')
      .select('id, title, due_date, report_id')
      .eq('id', report_task_id)
      .single()

    if (taskError) {
      if (taskError.code === 'PGRST116') {
        return NextResponse.json({ error: 'タスクが見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: taskError.message }, { status: 500 })
    }

    if (!task.due_date) {
      return NextResponse.json({ error: 'このタスクには期限が設定されていません' }, { status: 400 })
    }

    if (proposed_due_date <= task.due_date) {
      return NextResponse.json({ error: '新しい期限は現在の期限より後の日付にしてください' }, { status: 400 })
    }

    // Check for existing pending request
    const { data: existing } = await supabase
      .from('deadline_extension_requests')
      .select('id')
      .eq('report_task_id', report_task_id)
      .eq('status', 'pending')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'このタスクには既に保留中の延長申請があります' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('deadline_extension_requests')
      .insert({
        organization_id: profile.organization_id,
        report_task_id,
        report_id: task.report_id,
        task_title: task.title,
        requester_id: user.id,
        approver_id,
        original_due_date: task.due_date,
        proposed_due_date,
        reason: reason?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const approver_id = searchParams.get('approver_id')
    const report_task_id = searchParams.get('report_task_id')
    const report_id = searchParams.get('report_id')
    const status = searchParams.get('status')

    let query = supabase
      .from('deadline_extension_requests')
      .select('*, requester:users!deadline_extension_requests_requester_id_fkey(id, name), approver:users!deadline_extension_requests_approver_id_fkey(id, name)')
      .order('created_at', { ascending: false })

    if (approver_id) query = query.eq('approver_id', approver_id)
    if (report_task_id) query = query.eq('report_task_id', report_task_id)
    if (report_id) query = query.eq('report_id', report_id)
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, report_task_id } = body

    if (!id || !report_task_id) {
      return NextResponse.json({ error: 'id と report_task_id は必須です' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('deadline_extension_requests')
      .update({ report_task_id })
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
