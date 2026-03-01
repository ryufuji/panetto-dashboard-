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
      .from('report_tasks')
      .select('*')
      .eq('report_id', id)
      .order('order_index', { ascending: true })

    if (error) {
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

export async function POST(
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
    const {
      parent_task_id,
      title,
      description,
      estimated_hours,
      actual_hours,
      progress_rate = 0,
      task_type,
      priority = 'medium',
      due_date,
      order_index = 0,
    } = body

    if (!title) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 }
      )
    }

    if (progress_rate < 0 || progress_rate > 100) {
      return NextResponse.json(
        { error: 'progress_rate must be between 0 and 100' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('report_tasks')
      .insert({
        report_id: id,
        parent_task_id: parent_task_id || null,
        title,
        description,
        estimated_hours,
        actual_hours,
        progress_rate,
        task_type,
        priority,
        due_date: due_date || null,
        order_index,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
