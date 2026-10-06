// DB 側の期日遅れ判定（overdue_tasks 関数）が満たすべき性質を、本番データに対して検証する。
// 実行: npx tsx scripts/test-overdue-tasks.ts
// 読み取りのみで、データは一切変更しない。
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { STALE_DAYS } from '../src/lib/overdue-tasks'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const today = new Date().toISOString().split('T')[0]

interface Row {
  id: string; title: string; due_date: string | null; progress_rate: number; task_status: string | null
  report_id: string; report_date: string; user_id: string; user_name: string
  is_overdue: boolean; is_stale: boolean; stale_days: number | null
}

async function callFn(orgId: string | null, userId: string | null): Promise<Row[]> {
  const { data, error } = await supabase.rpc('overdue_tasks', {
    p_today: today, p_user_id: userId, p_org_id: orgId, p_stale_days: STALE_DAYS,
  })
  if (error) throw new Error(`overdue_tasks の呼び出しに失敗: ${error.message}`)
  return (data || []) as Row[]
}

async function main() {
  const { data: anyUser } = await supabase.from('users').select('organization_id').limit(1).single()
  const orgId = (anyUser as any).organization_id
  const rows = await callFn(orgId, null)
  console.log(`今日 ${today} / 停滞のしきい値 ${STALE_DAYS}日 / 組織全体で ${rows.length} 件`)

  // 同じ人の同じタスク名が重複して出ていないか
  const seen = new Set<string>()
  const dup: string[] = []
  for (const r of rows) {
    const k = `${r.user_id}\u0000${r.title.trim()}`
    if (seen.has(k)) dup.push(`${r.user_name} / ${r.title}`)
    seen.add(k)
  }

  // 返った各行が、その人のそのタスク名の最新の日報の行か
  // PostgREST は1リクエストで1000行までしか返さないので、ページングして全件そろえる
  const all: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('report_tasks')
      .select('id, title, report_id, reports!inner(report_date, user_id, status)')
      .is('parent_task_id', null).in('reports.status', ['submitted', 'approved'])
      .order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`report_tasks の読み出しに失敗: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
  }
  const newest = new Map<string, string>()
  for (const t of all) {
    const k = `${t.reports.user_id}\u0000${(t.title || '').trim()}`
    const cur = newest.get(k)
    if (!cur || t.reports.report_date > cur) newest.set(k, t.reports.report_date)
  }
  console.log(`  （照合用に report_tasks を ${all.length} 行読み込み）`)
  const notLatest = rows.filter(r => newest.get(`${r.user_id}\u0000${r.title.trim()}`) !== r.report_date)

  // 停滞と判定された行が、本当に定期タスクでないか
  const staleIds = rows.filter(r => r.is_stale).map(r => r.id)
  const { data: staleRows } = await supabase
    .from('report_tasks').select('id, is_recurring').in('id', staleIds.slice(0, 200))
  const recurringStale = (staleRows || []).filter((t: any) => t.is_recurring === true)

  // 自分のみスコープが組織全体の部分集合になっているか
  const someone = rows[0]?.user_id
  const mine = someone ? await callFn(null, someone) : []
  const orgIdsOfUser = new Set(rows.filter(r => r.user_id === someone).map(r => r.id))
  const mineOverdueNotInOrg = mine.filter(r => r.is_overdue && !orgIdsOfUser.has(r.id))

  const cases: [string, boolean, string][] = [
    ['同じ人の同じタスク名が重複しない', dup.length === 0, dup.slice(0, 3).join(' / ')],
    ['返る行はすべて最新の日報の行', notLatest.length === 0, notLatest.slice(0, 3).map(r => `${r.user_name}/${r.title}`).join(' / ')],
    ['完了したタスクを含まない', rows.every(r => r.progress_rate < 100 && r.task_status !== '完了'), ''],
    ['期日超過の行は期日が今日より前', rows.filter(r => r.is_overdue).every(r => !!r.due_date && r.due_date < today), ''],
    ['期日超過でも停滞でもない行を含まない', rows.every(r => r.is_overdue || r.is_stale), ''],
    ['停滞の行には止まった日数が入る', rows.filter(r => r.is_stale).every(r => (r.stale_days ?? 0) >= STALE_DAYS), ''],
    ['毎日引き継ぐ定期タスクは停滞にしない', recurringStale.length === 0, recurringStale.slice(0, 3).map((t: any) => t.id).join(' / ')],
    ['自分のみの期日超過は組織全体にも出る', mineOverdueNotInOrg.length === 0, mineOverdueNotInOrg.slice(0, 3).map(r => r.title).join(' / ')],
    ['停滞を含めない呼び出しでは期日超過だけ残る', rows.filter(r => r.is_overdue).length < rows.length || rows.every(r => r.is_overdue), ''],
  ]

  let fail = 0
  for (const [name, ok, detail] of cases) {
    if (!ok) fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` → ${detail}` : ''}`)
  }
  console.log(`期日超過 ${rows.filter(r => r.is_overdue).length}件 / 停滞のみ ${rows.filter(r => !r.is_overdue && r.is_stale).length}件`)
  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
  process.exit(fail ? 1 : 0)
}
main()
