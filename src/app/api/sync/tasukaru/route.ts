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

interface StoreDailyReportRow {
  id: string
  organization_id: string
  external_user_id: string
  external_user_name: string
  store_name: string
  report_date: string
  task_count: number
  completed_count: number
  created_at: string
  updated_at: string
}

/** 1リクエストで送る行数。PostgREST は1回に1000行までしか返さない */
const UPSERT_CHUNK = 500
const PAGE_SIZE = 1000
/** .in() に渡すIDの数。UUID を並べすぎると URL が長くなりリクエストが落ちる */
const IN_CHUNK = 100

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * タス軽くんから取ってきたタスクを DB に反映する。
 * 同じ入力で何度呼んでも同じ状態になる（結果の件数も変わらない）。
 */
export async function syncTasksToDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tasks: TasukaruTask[],
): Promise<{ created: number; updated: number; deleted: number; errors: string[] }> {
  // Step 3: 日報とタスクをまとめて書き込む
  //
  // 以前はタスク1件ごとに「日報を upsert → 既存タスクを確認 → タスクを upsert」と
  // 3往復していたため、10分おきの同期のたびに DB へ大量の書き込みが走り、
  // Supabase の Disk IO を使い切りかけていた。往復回数をタスク件数に比例させない。
  const syncedTaskIds = new Set(tasks.map(t => t.id))
  const errors: string[] = []
  const now = new Date().toISOString()

  // (担当者, 日付) ごとに1行にまとめる。同じキーを1回の upsert に2つ入れると
  // 「ON CONFLICT DO UPDATE command cannot affect row a second time」で落ちる
  const reportKey = (externalUserId: string, reportDate: string) => `${externalUserId}\u0000${reportDate}`
  const reportSeeds = new Map<string, Record<string, unknown>>()
  for (const task of tasks) {
    const reportDate = toJSTDateString(task.updatedAt || task.createdAt)
    reportSeeds.set(reportKey(task.assignee.id, reportDate), {
      organization_id: PANETTO_ORG_ID,
      external_user_id: task.assignee.id,
      external_user_name: task.assignee.name,
      store_name: task.store.name,
      report_date: reportDate,
    })
  }

  const reportRows: StoreDailyReportRow[] = []
  for (const part of chunk([...reportSeeds.values()], UPSERT_CHUNK)) {
    const { data, error } = await supabase
      .from('store_daily_reports')
      .upsert(part, { onConflict: 'organization_id,external_user_id,report_date' })
      .select()
    if (error) {
      errors.push(`日報の保存に失敗: ${error.message}`)
      continue
    }
    reportRows.push(...((data || []) as StoreDailyReportRow[]))
  }
  const reportIdByKey = new Map(
    reportRows.map(r => [reportKey(r.external_user_id, r.report_date), r.id])
  )
  const touchedReportIds = new Set(reportRows.map(r => r.id))

  // 既存タスクを1度だけ読み出す。created / updated の判定と、
  // タス軽くん側から消えたタスクの洗い出しの両方に使う
  const existingTasks: { id: string; external_task_id: string; report_id: string }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('store_daily_report_tasks')
      .select('id, external_task_id, report_id')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      errors.push(`既存タスクの読み出しに失敗: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    existingTasks.push(...(data as typeof existingTasks))
    if (data.length < PAGE_SIZE) break
  }
  const existingTaskIds = new Set(existingTasks.map(t => t.external_task_id))

  // タスクIDごとに1行にまとめる。同じキーを1回の upsert に2つ入れると
  // 日報と同じく「ON CONFLICT DO UPDATE command cannot affect row a second time」で落ちる。
  // 同じIDが2回届いたら後に来たほうを採る（1件ずつ書いていたときと同じ結果になる）
  const taskSeeds = new Map<string, Record<string, unknown>>()
  for (const task of tasks) {
    const reportDate = toJSTDateString(task.updatedAt || task.createdAt)
    const reportId = reportIdByKey.get(reportKey(task.assignee.id, reportDate))
    if (!reportId) continue
    taskSeeds.set(task.id, {
      report_id: reportId,
      external_task_id: task.id,
      title: task.title,
      description: task.description || null,
      status: task.status,
      category: task.category || 'general',
      priority: task.priority || 'normal',
      start_date: null,
      due_date: task.dueDate ? task.dueDate.split('T')[0] : null,
      synced_at: now,
    })
  }
  const taskRows = [...taskSeeds.values()] as {
    report_id: string; external_task_id: string; status: string; [k: string]: unknown
  }[]

  for (const part of chunk(taskRows, UPSERT_CHUNK)) {
    const { error } = await supabase
      .from('store_daily_report_tasks')
      .upsert(part, { onConflict: 'external_task_id' })
    if (error) errors.push(`タスクの保存に失敗: ${error.message}`)
  }

  const created = taskRows.filter(t => !existingTaskIds.has(t.external_task_id)).length
  const updated = taskRows.length - created

  // Step 4: タス軽くん側から消えたタスクを削除する。
  // 対象は今回触れた日報に属するものだけ（触れていない日報には手を出さない）
  const orphanIds = existingTasks
    .filter(t => touchedReportIds.has(t.report_id) && !syncedTaskIds.has(t.external_task_id))
    .map(t => t.id)
  for (const part of chunk(orphanIds, IN_CHUNK)) {
    const { error } = await supabase.from('store_daily_report_tasks').delete().in('id', part)
    if (error) errors.push(`不要タスクの削除に失敗: ${error.message}`)
  }
  const deleted = orphanIds.length

  // Step 5: 触れた日報の件数を数え直す。
  // 消えたタスクは上で削除済みなので、残るのは今回同期したタスクだけ
  const counts = new Map<string, { total: number; done: number }>()
  for (const row of taskRows) {
    const c = counts.get(row.report_id) || { total: 0, done: 0 }
    c.total++
    if (row.status === 'done') c.done++
    counts.set(row.report_id, c)
  }
  const recounted = reportRows
    .filter(r => (counts.get(r.id)?.total ?? 0) > 0)
    .map(r => ({
      ...r,
      task_count: counts.get(r.id)!.total,
      completed_count: counts.get(r.id)!.done,
      updated_at: now,
    }))
  for (const part of chunk(recounted, UPSERT_CHUNK)) {
    const { error } = await supabase.from('store_daily_reports').upsert(part, { onConflict: 'id' })
    if (error) errors.push(`日報の件数更新に失敗: ${error.message}`)
  }

  // タスクが1件も残らなかった日報を片付ける
  const emptyReportIds = reportRows.filter(r => (counts.get(r.id)?.total ?? 0) === 0).map(r => r.id)
  for (const part of chunk(emptyReportIds, IN_CHUNK)) {
    const { error } = await supabase.from('store_daily_reports').delete().in('id', part)
    if (error) errors.push(`空の日報の削除に失敗: ${error.message}`)
  }

  return { created, updated, deleted, errors }
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

    const { created, updated, deleted, errors } = await syncTasksToDb(supabase, tasks)

      return NextResponse.json({
        success: errors.length === 0,
        synced: tasks.length,
        created,
        updated,
        deleted,
        ...(errors.length > 0 ? { errors } : {}),
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
