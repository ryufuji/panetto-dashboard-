import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const PANETTO_ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.WEBHOOK_SECRET
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { event, task } = body

    if (!event || !task || !task.id) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (event === 'task.created' || event === 'task.updated') {
      const { error } = await supabase
        .from('store_tasks')
        .upsert(
          {
            organization_id: PANETTO_ORG_ID,
            external_task_id: task.id,
            title: task.title,
            description: task.description || null,
            store_name: task.store?.name || '不明',
            assignee_name: task.assignee?.name || null,
            start_date: task.startDate ? String(task.startDate).split('T')[0] : null,
            due_date: task.dueDate ? String(task.dueDate).split('T')[0] : null,
            status: task.status || 'todo',
            category: task.category || 'general',
            priority: task.priority || 'normal',
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'external_task_id' }
        )

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, event })
    }

    if (event === 'task.deleted') {
      const { error } = await supabase
        .from('store_tasks')
        .delete()
        .eq('external_task_id', task.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, event })
    }

    return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
