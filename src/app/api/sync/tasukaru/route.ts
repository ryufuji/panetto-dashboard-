import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const PANETTO_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

interface TasukaruTask {
  id: string
  title: string
  description?: string
  status: string
  category: string
  priority: string
  dueDate?: string
  createdAt: string
  updatedAt: string
  assignee: { id: string; name: string }
  store: { id: string; name: string }
}

interface TasukaruResponse {
  tasks: TasukaruTask[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function toJSTDateString(isoString: string): string {
  const d = new Date(isoString)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().split('T')[0]
}

async function loginToTasukaru(baseUrl: string, email: string, password: string): Promise<string> {
  // Step 1: Get CSRF token and session cookie
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: 'GET',
    redirect: 'manual',
  })
  const csrfData = await csrfRes.json()
  const csrfToken = csrfData.csrfToken
  const cookies = csrfRes.headers.getSetCookie?.() || []
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ')

  // Step 2: Sign in with credentials
  const signinRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
    },
    body: `csrfToken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
    redirect: 'manual',
  })

  // Collect all cookies from both responses
  const signinCookies = signinRes.headers.getSetCookie?.() || []
  const allCookies = [...cookies, ...signinCookies]
    .map(c => c.split(';')[0])
    .filter((v, i, a) => {
      const name = v.split('=')[0]
      return a.findIndex(x => x.split('=')[0] === name) === i
    })

  return allCookies.join('; ')
}

async function fetchAllTasks(baseUrl: string, sessionCookie: string): Promise<TasukaruTask[]> {
  const allTasks: TasukaruTask[] = []
  let page = 1

  while (true) {
    const res = await fetch(`${baseUrl}/api/tasks?page=${page}&limit=50`, {
      headers: { 'Cookie': sessionCookie },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch tasks: ${res.status} ${res.statusText}`)
    }

    const data: TasukaruResponse = await res.json()
    allTasks.push(...data.tasks)

    if (page >= data.pagination.totalPages) break
    page++
  }

  return allTasks
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recountReport(supabase: any, reportId: string) {
  const { data: tasks } = await supabase
    .from('store_daily_report_tasks')
    .select('status')
    .eq('report_id', reportId)

  const taskCount = tasks?.length || 0
  const completedCount = tasks?.filter((t: { status: string }) => t.status === 'done').length || 0

  await supabase
    .from('store_daily_reports')
    .update({ task_count: taskCount, completed_count: completedCount })
    .eq('id', reportId)
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return POST()
}

export async function POST() {
  try {
    const apiUrl = process.env.TASUKARU_API_URL
    const apiEmail = process.env.TASUKARU_API_EMAIL
    const apiPassword = process.env.TASUKARU_API_PASSWORD

    if (!apiUrl || !apiEmail || !apiPassword) {
      return NextResponse.json(
        { error: 'TASUKARU_API_URL, TASUKARU_API_EMAIL, TASUKARU_API_PASSWORD must be set' },
        { status: 500 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Acquire advisory lock so concurrent cron + manual button clicks don't race
    const { data: lockAcquired } = await supabase.rpc('try_sync_lock', { key: 'tasukaru_sync' })
    if (lockAcquired === false) {
      return NextResponse.json({ success: true, skipped: 'another sync in progress' })
    }

    try {
      // Step 1: Login to タス軽くん
      const sessionCookie = await loginToTasukaru(apiUrl, apiEmail, apiPassword)

    // Step 2: Fetch all tasks
    const tasks = await fetchAllTasks(apiUrl, sessionCookie)

    // Step 3: Upsert each task
    let created = 0
    let updated = 0
    const syncedTaskIds: string[] = []
    const touchedReportIds = new Set<string>()

    for (const task of tasks) {
      syncedTaskIds.push(task.id)
      const reportDate = toJSTDateString(task.updatedAt || task.createdAt)

      // Upsert daily report
      const { data: report, error: reportError } = await supabase
        .from('store_daily_reports')
        .upsert(
          {
            organization_id: PANETTO_ORG_ID,
            external_user_id: task.assignee.id,
            external_user_name: task.assignee.name,
            store_name: task.store.name,
            report_date: reportDate,
          },
          { onConflict: 'organization_id,external_user_id,report_date' }
        )
        .select('id')
        .single()

      if (reportError) {
        console.error('[SYNC] Report upsert error:', reportError.message)
        continue
      }

      touchedReportIds.add(report.id)

      // Check if task already exists
      const { data: existing } = await supabase
        .from('store_daily_report_tasks')
        .select('id')
        .eq('external_task_id', task.id)
        .maybeSingle()

      // Upsert task
      const { error: taskError } = await supabase
        .from('store_daily_report_tasks')
        .upsert(
          {
            report_id: report.id,
            external_task_id: task.id,
            title: task.title,
            description: task.description || null,
            status: task.status,
            category: task.category || 'general',
            priority: task.priority || 'normal',
            start_date: null,
            due_date: task.dueDate ? task.dueDate.split('T')[0] : null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'external_task_id' }
        )

      if (taskError) {
        console.error('[SYNC] Task upsert error:', taskError.message)
        continue
      }

      if (existing) {
        updated++
      } else {
        created++
      }
    }

    // Step 4: Delete orphaned tasks (in DB but not in タス軽くん)
    let deleted = 0
    if (syncedTaskIds.length > 0) {
      const { data: orphanTasks } = await supabase
        .from('store_daily_report_tasks')
        .select('id, report_id, external_task_id')
        .not('external_task_id', 'in', `(${syncedTaskIds.join(',')})`)
        .in('report_id', Array.from(touchedReportIds))

      if (orphanTasks && orphanTasks.length > 0) {
        for (const orphan of orphanTasks) {
          await supabase
            .from('store_daily_report_tasks')
            .delete()
            .eq('id', orphan.id)

          touchedReportIds.add(orphan.report_id)
          deleted++
        }
      }
    }

    // Step 5: Recount all touched reports
    for (const reportId of touchedReportIds) {
      await recountReport(supabase, reportId)
    }

    // Clean up empty reports
    for (const reportId of touchedReportIds) {
      const { count } = await supabase
        .from('store_daily_report_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', reportId)

      if (count === 0) {
        await supabase
          .from('store_daily_reports')
          .delete()
          .eq('id', reportId)
      }
    }

      return NextResponse.json({
        success: true,
        synced: tasks.length,
        created,
        updated,
        deleted,
      })
    } finally {
      await supabase.rpc('release_sync_lock', { key: 'tasukaru_sync' })
    }
  } catch (err) {
    console.error('[SYNC] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
