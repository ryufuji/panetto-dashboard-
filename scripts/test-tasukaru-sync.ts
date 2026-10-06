// タス軽くん同期の DB 反映（syncTasksToDb）を、本番の現データを入力に検証する。
// 実行: npx tsx scripts/test-tasukaru-sync.ts
// 現在 DB にあるタスクをそのまま入力にするので、新しいデータは作らない。
// 同じ入力で2回流して、1回目と2回目で状態も件数も変わらないことを確かめる。
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { syncTasksToDb } from '../src/app/api/sync/tasukaru/route'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function snapshot() {
  const { data: reports } = await supabase
    .from('store_daily_reports')
    .select('id, external_user_id, external_user_name, store_name, report_date, task_count, completed_count')
    .order('id')
  const { data: tasks } = await supabase
    .from('store_daily_report_tasks')
    .select('id, report_id, external_task_id, title, description, status, category, priority, due_date')
    .order('id')
  return { reports: reports || [], tasks: tasks || [] }
}

/** 今 DB にあるタスクから、タス軽くんの返却形を組み立て直す */
async function buildInput() {
  const { data } = await supabase
    .from('store_daily_report_tasks')
    .select('external_task_id, title, description, status, category, priority, due_date, store_daily_reports!inner(external_user_id, external_user_name, store_name, report_date)')
    .order('external_task_id')
  return (data || []).map((t: any) => ({
    id: t.external_task_id,
    title: t.title,
    description: t.description || undefined,
    status: t.status,
    category: t.category,
    priority: t.priority,
    dueDate: t.due_date ? `${t.due_date}T00:00:00.000Z` : undefined,
    createdAt: `${t.store_daily_reports.report_date}T03:00:00.000Z`, // JST 正午 = 同じ日付になる
    updatedAt: `${t.store_daily_reports.report_date}T03:00:00.000Z`,
    assignee: { id: t.store_daily_reports.external_user_id, name: t.store_daily_reports.external_user_name },
    store: { id: 'x', name: t.store_daily_reports.store_name },
  }))
}

const key = (o: any) => JSON.stringify(o)
function sameSet(a: any[], b: any[], drop: string[] = []) {
  const strip = (r: any) => { const c = { ...r }; for (const d of drop) delete c[d]; return c }
  const A = a.map(strip).map(key).sort()
  const B = b.map(strip).map(key).sort()
  return JSON.stringify(A) === JSON.stringify(B)
}

async function main() {
  const input = await buildInput()
  console.log(`入力に使うタスク ${input.length} 件`)
  if (input.length === 0) { console.log('タスクが0件のため検証できない'); process.exit(1) }

  const before = await snapshot()
  console.log(`実行前: 日報 ${before.reports.length} 件 / タスク ${before.tasks.length} 件`)

  const r1 = await syncTasksToDb(supabase, input as any)
  const after1 = await snapshot()
  console.log(`1回目: created=${r1.created} updated=${r1.updated} deleted=${r1.deleted} errors=${r1.errors.length}`)

  const r2 = await syncTasksToDb(supabase, input as any)
  const after2 = await snapshot()
  console.log(`2回目: created=${r2.created} updated=${r2.updated} deleted=${r2.deleted} errors=${r2.errors.length}`)

  // 件数が合っているか（入力のタスクは全部その日報に属するはず）
  const countsOk = after1.reports
    .filter(r => after1.tasks.some(t => t.report_id === r.id))
    .every(r => {
      const mine = after1.tasks.filter(t => t.report_id === r.id)
      return r.task_count === mine.length && r.completed_count === mine.filter(t => t.status === 'done').length
    })

  const cases: [string, boolean, string][] = [
    ['既存タスクを消さない', after1.tasks.length === before.tasks.length, `${before.tasks.length} → ${after1.tasks.length}`],
    ['既存タスクの内容が変わらない', sameSet(before.tasks, after1.tasks), ''],
    ['タスクが無い日報は残らない', after1.reports.every(r => after1.tasks.some(t => t.report_id === r.id)), `日報 ${before.reports.length} → ${after1.reports.length}`],
    ['新規作成が発生しない（全部既存）', r1.created === 0, `created=${r1.created}`],
    ['更新件数が入力件数と一致', r1.updated === input.length, `${r1.updated} vs ${input.length}`],
    ['不要タスクの削除が起きない', r1.deleted === 0, `deleted=${r1.deleted}`],
    ['エラーが出ない', r1.errors.length === 0, r1.errors.join(' / ')],
    ['日報の件数が実際のタスク数と合う', countsOk, ''],
    ['2回流しても状態が変わらない', sameSet(after1.tasks, after2.tasks) && sameSet(after1.reports, after2.reports), `日報 ${after1.reports.length} → ${after2.reports.length}`],
    ['2回目も結果の件数が同じ', r1.created === r2.created && r1.updated === r2.updated && r1.deleted === r2.deleted, ''],
  ]

  let fail = 0
  for (const [name, ok, detail] of cases) {
    if (!ok) fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` → ${detail}` : ''}`)
  }
  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
  process.exit(fail ? 1 : 0)
}
main()
