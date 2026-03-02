import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const PANETTO_ORG_ID = '00000000-0000-0000-0000-000000000001'

function toJSTDateString(isoString: string): string {
  const d = new Date(isoString)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().split('T')[0]
}

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
      const reportDate = toJSTDateString(task.updatedAt || task.createdAt || new Date().toISOString())
      const externalUserId = task.assignee?.id || 'unknown'
      const externalUserName = task.assignee?.name || '不明'
      const storeName = task.store?.name || '不明'

      // Upsert the daily report
      const { data: report, error: reportError } = await supabase
        .from('store_daily_reports')
        .upsert(
          {
            organization_id: PANETTO_ORG_ID,
            external_user_id: externalUserId,
            external_user_name: externalUserName,
            store_name: storeName,
            report_date: reportDate,
          },
          { onConflict: 'organization_id,external_user_id,report_date' }
        )
        .select('id')
        .single()

      if (reportError) {
        return NextResponse.json({ error: reportError.message }, { status: 500 })
      }

      // Upsert the task
      const { error: taskError } = await supabase
        .from('store_daily_report_tasks')
        .upsert(
          {
            report_id: report.id,
            external_task_id: task.id,
            title: task.title,
            description: task.description || null,
            status: task.status || 'todo',
            category: task.category || 'general',
            priority: task.priority || 'normal',
            start_date: task.startDate ? String(task.startDate).split('T')[0] : null,
            due_date: task.dueDate ? String(task.dueDate).split('T')[0] : null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'external_task_id' }
        )

      if (taskError) {
        return NextResponse.json({ error: taskError.message }, { status: 500 })
      }

      // Recount tasks for this report
      await recountReport(supabase, report.id)

      return NextResponse.json({ success: true, event })
    }

    if (event === 'task.deleted') {
      // Find the task to get its report_id
      const { data: existingTask } = await supabase
        .from('store_daily_report_tasks')
        .select('id, report_id')
        .eq('external_task_id', task.id)
        .single()

      if (!existingTask) {
        return NextResponse.json({ success: true, event, message: 'Task not found, nothing to delete' })
      }

      const reportId = existingTask.report_id

      // Delete the task
      const { error: deleteError } = await supabase
        .from('store_daily_report_tasks')
        .delete()
        .eq('id', existingTask.id)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }

      // Check remaining tasks for this report
      const { count } = await supabase
        .from('store_daily_report_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', reportId)

      if (count === 0) {
        // No tasks left, delete the report
        await supabase
          .from('store_daily_reports')
          .delete()
          .eq('id', reportId)
      } else {
        // Recount
        await recountReport(supabase, reportId)
      }

      return NextResponse.json({ success: true, event })
    }

    return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recountReport(supabase: any, reportId: string) {
  const { data: tasks } = await supabase
    .from('store_daily_report_tasks')
    .select('status')
    .eq('report_id', reportId)

  const taskCount = tasks?.length || 0
  const completedCount = tasks?.filter((t: any) => t.status === 'done').length || 0

  await supabase
    .from('store_daily_reports')
    .update({ task_count: taskCount, completed_count: completedCount })
    .eq('id', reportId)
}
