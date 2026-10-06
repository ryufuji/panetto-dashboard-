// タス軽くん同期の DB 反映ロジックを、supabase クライアントのモックで検証する。
// 実行: npx tsx scripts/test-tasukaru-sync-logic.ts
// DB には一切触れない。1リクエストあたりの行数やIDの数、削除の範囲を確かめる。
import { syncTasksToDb } from '../src/app/api/sync/tasukaru/route'

interface Call { table: string; op: 'upsert' | 'delete' | 'select'; rows?: any[]; ids?: any[] }

/** 既存タスクとして返す行を差し込めるモック */
function mockSupabase(existingTasks: any[] = []) {
  const calls: Call[] = []
  let reportSeq = 0
  const from = (table: string) => ({
    upsert: (rows: any[], _opts?: any) => {
      calls.push({ table, op: 'upsert', rows })
      const result = {
        select: async () => ({
          data: rows.map(r => ({ ...r, id: r.id ?? `report-${reportSeq++}` })),
          error: null,
        }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      }
      return result
    },
    select: (_cols: string) => ({
      order: () => ({
        // PostgREST と同じく1回に1000行まで返す
        range: async (from_: number, to_: number) => ({
          data: existingTasks.slice(from_, to_ + 1),
          error: null,
        }),
      }),
    }),
    delete: () => ({
      in: async (_col: string, ids: any[]) => {
        calls.push({ table, op: 'delete', ids })
        return { error: null }
      },
    }),
  })
  return { client: { from } as any, calls }
}

const task = (id: string, assignee: string, date: string, status = 'todo') => ({
  id, title: `タスク${id}`, description: undefined, status, category: 'general', priority: 'normal',
  dueDate: undefined,
  createdAt: `${date}T03:00:00.000Z`, updatedAt: `${date}T03:00:00.000Z`,
  assignee: { id: assignee, name: `担当${assignee}` },
  store: { id: 's', name: '店舗' },
})

async function main() {
  const cases: [string, boolean, string][] = []

  // 1. 同じ担当者・同じ日付のタスクが複数あっても、日報は1行だけ送る
  //    （同じキーを1回の upsert に2つ入れると PostgreSQL が落ちる）
  {
    const m = mockSupabase()
    await syncTasksToDb(m.client, [
      task('t1', 'u1', '2026-10-01'), task('t2', 'u1', '2026-10-01'), task('t3', 'u1', '2026-10-01'),
      task('t4', 'u2', '2026-10-01'),
    ] as any)
    const reportUpserts = m.calls.filter(c => c.table === 'store_daily_reports' && c.op === 'upsert')
    const firstRows = reportUpserts[0]?.rows || []
    const keys = firstRows.map((r: any) => `${r.external_user_id}|${r.report_date}`)
    cases.push(['同じ担当者・日付は1行にまとめる', keys.length === new Set(keys).size && firstRows.length === 2, `${firstRows.length}行 / キー${new Set(keys).size}種`])
  }

  // 2. 往復回数がタスク件数に比例しない
  {
    const m = mockSupabase()
    const many = Array.from({ length: 600 }, (_, i) => task(`t${i}`, `u${i % 30}`, '2026-10-01'))
    await syncTasksToDb(m.client, many as any)
    const writes = m.calls.filter(c => c.op !== 'select').length
    cases.push(['600件でも書き込み回数が10回以下', writes <= 10, `${writes}回`])
    const taskUpserts = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'upsert')
    cases.push(['1リクエストの行数が500以下', taskUpserts.every(c => (c.rows?.length || 0) <= 500), taskUpserts.map(c => c.rows!.length).join(',')])
  }

  // 3. 大量件数でもチャンクに割れる
  {
    const m = mockSupabase()
    const many = Array.from({ length: 1200 }, (_, i) => task(`t${i}`, `u${i}`, '2026-10-01'))
    await syncTasksToDb(m.client, many as any)
    const taskUpserts = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'upsert')
    const total = taskUpserts.reduce((n, c) => n + c.rows!.length, 0)
    cases.push(['1200件が分割され、全件送られる', taskUpserts.length === 3 && total === 1200, `${taskUpserts.length}回 / 計${total}件`])
  }

  // 4. タス軽くん側から消えたタスクだけを削除する（触れていない日報には手を出さない）
  {
    const existing = [
      { id: 'keep', external_task_id: 't1', report_id: 'report-0' },   // 今回も来ている
      { id: 'gone', external_task_id: 'old', report_id: 'report-0' },  // 今回来ていない → 消す
      { id: 'other', external_task_id: 'x', report_id: 'untouched' },  // 別の日報 → 残す
    ]
    const m = mockSupabase(existing)
    const r = await syncTasksToDb(m.client, [task('t1', 'u1', '2026-10-01')] as any)
    const deletes = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'delete')
    const deletedIds = deletes.flatMap(c => c.ids!)
    cases.push(['消えたタスクだけを削除する', deletedIds.length === 1 && deletedIds[0] === 'gone', deletedIds.join(',')])
    cases.push(['触れていない日報のタスクは残す', !deletedIds.includes('other'), ''])
    cases.push(['削除件数が結果に出る', r.deleted === 1, `deleted=${r.deleted}`])
    cases.push(['既存は updated、新規は created で数える', r.created === 0 && r.updated === 1, `c=${r.created} u=${r.updated}`])
  }

  // 5. 削除するIDは1リクエストに100件まで（URL が長くなりすぎないように）
  {
    const existing = Array.from({ length: 250 }, (_, i) => ({ id: `d${i}`, external_task_id: `old${i}`, report_id: 'report-0' }))
    const m = mockSupabase(existing)
    await syncTasksToDb(m.client, [task('t1', 'u1', '2026-10-01')] as any)
    const deletes = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'delete')
    cases.push(['削除IDは100件ずつに割る', deletes.length === 3 && deletes.every(c => c.ids!.length <= 100), deletes.map(c => c.ids!.length).join(',')])
  }

  // 6. タスクが0件でも落ちない
  {
    const m = mockSupabase()
    const r = await syncTasksToDb(m.client, [])
    cases.push(['タスク0件でも落ちない', r.created === 0 && r.updated === 0 && r.deleted === 0 && r.errors.length === 0, JSON.stringify(r)])
  }

  // 7. 完了タスクの数え方
  {
    const m = mockSupabase()
    await syncTasksToDb(m.client, [
      task('t1', 'u1', '2026-10-01', 'done'), task('t2', 'u1', '2026-10-01', 'done'), task('t3', 'u1', '2026-10-01', 'todo'),
    ] as any)
    const recount = m.calls.filter(c => c.table === 'store_daily_reports' && c.op === 'upsert').at(-1)?.rows?.[0]
    cases.push(['日報の件数と完了数を数える', recount?.task_count === 3 && recount?.completed_count === 2, `${recount?.task_count}件中${recount?.completed_count}件完了`])
  }

  // 8. 同じタスクIDが2回届いても、1回の upsert に同じキーを2つ入れない
  {
    const m = mockSupabase()
    await syncTasksToDb(m.client, [
      task('dup', 'u1', '2026-10-01'), task('dup', 'u1', '2026-10-01'), task('t2', 'u1', '2026-10-01'),
    ] as any)
    const rows = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'upsert').flatMap(c => c.rows!)
    const ids = rows.map((r: any) => r.external_task_id)
    cases.push(['同じタスクIDが2回届いても1行にする', ids.length === new Set(ids).size, ids.join(',')])
  }

  // 9. 書き込みが失敗しても途中で止まらず、失敗は結果に残る
  {
    const m = mockSupabase()
    const orig = m.client.from
    m.client.from = (table: string) => {
      const api = orig(table)
      if (table === 'store_daily_report_tasks') {
        return { ...api, upsert: (rows: any[]) => ({ then: (res: any) => res({ data: null, error: { message: '書き込み失敗' } }) }) }
      }
      return api
    }
    const r = await syncTasksToDb(m.client, [task('t1', 'u1', '2026-10-01')] as any)
    cases.push(['書き込み失敗を握りつぶさない', r.errors.length > 0, r.errors.join(' / ')])
  }

  // 10. 日報の作成に失敗したら、そのタスクは触らない（既存を消さない）
  {
    const existing = [{ id: 'keep', external_task_id: 'old', report_id: 'report-0' }]
    const m = mockSupabase(existing)
    const orig = m.client.from
    m.client.from = (table: string) => {
      const api = orig(table)
      if (table === 'store_daily_reports') {
        return { ...api, upsert: () => ({ select: async () => ({ data: null, error: { message: '日報の作成失敗' } }) }) }
      }
      return api
    }
    const r = await syncTasksToDb(m.client, [task('t1', 'u1', '2026-10-01')] as any)
    const deletes = m.calls.filter(c => c.op === 'delete')
    cases.push(['日報の作成に失敗したら既存タスクを消さない', deletes.length === 0 && r.deleted === 0, `削除${deletes.length}回`])
  }

  // 11. 日報が500件を超えて分割されても、タスクが正しい日報に紐づく
  {
    const m = mockSupabase()
    const many = Array.from({ length: 700 }, (_, i) => task(`t${i}`, `u${i}`, '2026-10-01'))
    await syncTasksToDb(m.client, many as any)
    const reportUpserts = m.calls.filter(c => c.table === 'store_daily_reports' && c.op === 'upsert')
    const taskRows = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'upsert').flatMap(c => c.rows!)
    const reportIds = new Set(reportUpserts.flatMap(c => c.rows!).map((r: any) => r.id).filter(Boolean))
    const allHaveReport = taskRows.every((r: any) => r.report_id)
    cases.push(['日報が分割されても全タスクが紐づく', taskRows.length === 700 && allHaveReport, `${taskRows.length}件 / 日報upsert ${reportUpserts.length}回`])
  }

  // 12. 今回触れていない日報には手を出さない
  {
    const existing = [{ id: 'gone', external_task_id: 'old', report_id: 'untouched' }]
    const m = mockSupabase(existing)
    await syncTasksToDb(m.client, [task('t1', 'u2', '2026-10-01')] as any)
    const reportDeletes = m.calls.filter(c => c.table === 'store_daily_reports' && c.op === 'delete')
    const taskDeletes = m.calls.filter(c => c.table === 'store_daily_report_tasks' && c.op === 'delete')
    cases.push(['今回触れていない日報とそのタスクを消さない', reportDeletes.length === 0 && taskDeletes.length === 0, `日報${reportDeletes.length}回 / タスク${taskDeletes.length}回`])
  }

  // 13. 既存タスクが1000件を超えてもページングで全部読む
  {
    const existing = Array.from({ length: 2500 }, (_, i) => ({ id: `e${i}`, external_task_id: `t${i}`, report_id: 'report-0' }))
    const m = mockSupabase(existing)
    // 全部そのまま届く = 消えるものは無い
    const input = Array.from({ length: 2500 }, (_, i) => task(`t${i}`, 'u1', '2026-10-01'))
    const r = await syncTasksToDb(m.client, input as any)
    cases.push(['既存が1000件超でも全部読む（誤って消さない）', r.deleted === 0 && r.created === 0 && r.updated === 2500, `d=${r.deleted} c=${r.created} u=${r.updated}`])
  }

  let fail = 0
  for (const [name, ok, detail] of cases) {
    if (!ok) fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
  }
  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
  process.exit(fail ? 1 : 0)
}
main()
