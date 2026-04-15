import { createClient } from '@/lib/supabase/server'
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

    // LINE Works 通知: draft/未提出 → submitted への遷移時のみ発火
    const wasNotSubmitted = existing.status !== 'submitted'
    const isNowSubmitted = data.status === 'submitted'
    if (wasNotSubmitted && isNowSubmitted) {
      try {
        // 通知に必要なリレーションを1クエリでまとめて取得
        const { data: full } = await supabase
          .from('reports')
          .select(
            'id, report_date, title, work_hours, progress_rate, next_day_plan, ' +
            'user:users(name, department:departments!users_department_id_fkey(name)), ' +
            'tasks:report_tasks(title, status)'
          )
          .eq('id', id)
          .single()

        if (full) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = full as any
          const message = formatReportSubmittedMessage({
            reportId: f.id,
            userName: f.user?.name || '不明',
            reportDate: f.report_date,
            departmentName: f.user?.department?.name || null,
            workHours: f.work_hours ?? null,
            progressRate: f.progress_rate ?? null,
            title: f.title || null,
            tasks: (f.tasks || []).map((t: { title: string; status?: string }) => ({
              title: t.title,
              status: t.status,
            })),
            nextDayPlan: f.next_day_plan || null,
            appUrl: process.env.NEXT_PUBLIC_APP_URL,
          })
          // 失敗しても throw しないが、念のため try/catch
          await sendLineWorksMessage(message)
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
      .select('status')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft reports can be deleted' },
        { status: 400 }
      )
    }

    const { error } = await supabase.from('reports').delete().eq('id', id)

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
