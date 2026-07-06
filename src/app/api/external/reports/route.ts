/**
 * GET /api/external/reports — 自組織の提出済み日報を一括取得（BigQuery 取り込み用）
 *
 * 認証: Authorization: Bearer <api_token>
 *
 * クエリパラメータ:
 *   from     YYYY-MM-DD  取得開始日（省略時: 30日前）
 *   to       YYYY-MM-DD  取得終了日（省略時: 今日）
 *   limit    number      1回の取得件数 1〜200（デフォルト 100）
 *   offset   number      オフセット（デフォルト 0）
 *   include  "tasks"     タスクも含める場合に指定
 *
 * レスポンス:
 *   { data: Report[], total: number, limit: number, offset: number }
 *   Report には user: { name, email } が埋め込まれる
 *   include=tasks 時は tasks: Task[], planned_tasks: PlannedTask[] も付く
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveUserByToken, createExternalClient } from '@/lib/external-api'

export async function GET(req: NextRequest) {
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json(
    { error: '認証エラー: Authorization ヘッダーに Bearer <api_token> を指定してください' },
    { status: 401 }
  )

  const { searchParams } = new URL(req.url)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10)
  const defaultTo   = new Date().toISOString().slice(0, 10)

  const from   = searchParams.get('from')   || defaultFrom
  const to     = searchParams.get('to')     || defaultTo
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get('limit')  || '100')))
  const offset = Math.max(0,               parseInt(searchParams.get('offset') || '0'))
  const includeTasks = searchParams.get('include') === 'tasks'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from / to は YYYY-MM-DD 形式で指定してください' }, { status: 400 })
  }

  const supabase = createExternalClient()

  const { data: reports, error, count } = await supabase
    .from('reports')
    .select('*, user:users(name, email)', { count: 'exact' })
    .eq('organization_id', user.organization_id)
    .in('status', ['submitted', 'approved'])
    .gte('report_date', from)
    .lte('report_date', to)
    .order('report_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!includeTasks || !reports || reports.length === 0) {
    return NextResponse.json({ data: reports ?? [], total: count ?? 0, limit, offset })
  }

  // タスクと翌日予定タスクを一括取得してレポートに埋め込む
  const reportIds = reports.map(r => r.id)
  const [{ data: tasks, error: taskErr }, { data: plannedTasks, error: ptErr }] = await Promise.all([
    supabase.from('report_tasks').select('*').in('report_id', reportIds).order('order_index', { ascending: true }),
    supabase.from('report_planned_tasks').select('*').in('report_id', reportIds).order('order_index', { ascending: true }),
  ])
  if (taskErr)  return NextResponse.json({ error: taskErr.message },  { status: 500 })
  if (ptErr)    return NextResponse.json({ error: ptErr.message },    { status: 500 })

  const tasksByReport    = new Map<string, any[]>()
  const plannedByReport  = new Map<string, any[]>()
  for (const t of (tasks        || [])) { const a = tasksByReport.get(t.report_id)   || []; a.push(t); tasksByReport.set(t.report_id, a) }
  for (const p of (plannedTasks || [])) { const a = plannedByReport.get(p.report_id) || []; a.push(p); plannedByReport.set(p.report_id, a) }

  const enriched = reports.map(r => ({
    ...r,
    tasks:         tasksByReport.get(r.id)   ?? [],
    planned_tasks: plannedByReport.get(r.id) ?? [],
  }))

  return NextResponse.json({ data: enriched, total: count ?? 0, limit, offset })
}
