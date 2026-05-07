import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendLineWorksMessage, formatReportSubmittedMessage } from '@/lib/lineworks'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('reports')
      .select('*, user:users(*), tasks:report_tasks(*), comments:report_comments(*, user:users(*))')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch approval requests linked to this report's tasks
    if (data.tasks && data.tasks.length > 0) {
      const taskIds = data.tasks.map((t: any) => t.id)
      const { data: approvalRequests } = await supabase
        .from('approval_requests')
        .select('*')
        .in('report_task_id', taskIds)

      if (approvalRequests && approvalRequests.length > 0) {
        const approvalMap = new Map(approvalRequests.map((ar: any) => [ar.report_task_id, ar]))
        data.tasks = data.tasks.map((t: any) => ({
          ...t,
          approval_request: approvalMap.get(t.id) || null,
        }))
      }
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
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

    const { data: existing, error: fetchError } = await supabase
      .from('reports')
      .select('status')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('reports')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Note: approval creation is handled by the DB trigger (trg_report_on_submit)

    // LINE Works 通知: 未提出 → submitted への遷移時のみ発火（重複防止のため
    // lineworks_notified_at が未設定のときのみ送信し、成功したら記録する）
    const wasNotSubmitted = existing.status !== 'submitted'
    const isNowSubmitted = data.status === 'submitted'
    if (wasNotSubmitted && isNowSubmitted) {
      try {
        const { data: full } = await supabase
          .from('reports')
          .select(
            'id, report_date, title, work_hours, progress_rate, next_day_plan, ' +
            'start_time, end_time, submitted_at, lineworks_notified_at, ' +
            'user:users(name, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)), ' +
            'tasks:report_tasks(id, title, description, memo, actual_url, task_status, progress_rate, priority, estimated_hours, actual_hours, due_date, parent_task_id, order_index)'
          )
          .eq('id', id)
          .single()
        // planned_tasks は PostgREST の FK 認識問題回避のため別クエリで取得
        const { data: plannedRowsPut } = await supabase
          .from('report_planned_tasks')
          .select('title, order_index')
          .eq('report_id', id)
          .order('order_index', { ascending: true })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = full as any
        if (f && !f.lineworks_notified_at) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allTasks: any[] = f.tasks || []
          const parentTasks = allTasks
            .filter((t: any) => !t.parent_task_id)
            .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const childByParent = new Map<string, any[]>()
          for (const t of allTasks) {
            if (!t.parent_task_id) continue
            const arr = childByParent.get(t.parent_task_id) || []
            arr.push(t)
            childByParent.set(t.parent_task_id, arr)
          }
          for (const arr of childByParent.values()) {
            arr.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          }
          const plannedSorted = plannedRowsPut || []

          const message = formatReportSubmittedMessage({
            reportId: f.id,
            userName: f.user?.name || '不明',
            reportDate: f.report_date,
            submittedAt: f.submitted_at || null,
            startTime: f.start_time || null,
            endTime: f.end_time || null,
            officeName: f.user?.office?.name || null,
            departmentName: f.user?.department?.name || null,
            tasks: parentTasks.map((t: any) => ({
              title: t.title,
              task_status: t.task_status || null,
              progress_rate: t.progress_rate,
              estimated_hours: t.estimated_hours,
              due_date: t.due_date,
              memo: t.memo || null,
              description: t.description || null,
              actual_url: t.actual_url || null,
              children: (childByParent.get(t.id) || []).map((c: any) => ({ title: c.title })),
            })),
            plannedTasks: plannedSorted.map((p: any) => ({ title: p.title })),
            nextDayPlanText: f.next_day_plan || null,
          })
          const result = await sendLineWorksMessage(message)
          if (result.ok) {
            await supabase
              .from('reports')
              .update({ lineworks_notified_at: new Date().toISOString() })
              .eq('id', id)
          }
        }
      } catch (notifyErr) {
        console.error('[REPORT_PUT] LINE Works notification failed:', notifyErr)
        // 日報提出自体は成功させる
      }
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    const { data: existing, error: fetchError } = await supabase
      .from('reports')
      .select('status, user_id')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // 認可: 本人 または admin のみ削除可能
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    const isAuthor = (existing as { user_id: string }).user_id === user.id
    const isAdmin = (profile as { role: string } | null)?.role === 'admin'
    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: '削除権限がありません' }, { status: 403 })
    }

    // Service Role で削除 (RLS をバイパスして admin が他人の日報も削除できるように)
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { error } = await admin.from('reports').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Report deleted successfully' })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
