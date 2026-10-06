// 期日遅れタスクの判定 filterCurrentOverdue の検証。実行: npx tsx scripts/test-overdue-filter.ts
//
// 判定の意図:
//   - 同じ人・同じタスク名は最新の日報の行で判定する
//   - 完了したもの、定期タスクは出さない
//   - 毎日引き継いで進捗が動いているものは「対応中」なので出さない
//   - 期日を過ぎたもの、または7日以上進捗が動いていないものを出す
import { filterCurrentOverdue, STALE_DAYS } from '../src/lib/overdue-tasks'

const today = '2026-09-10'

type Row = {
  id: string
  title: string
  due_date: string | null
  progress_rate: number
  task_status: string | null
  report_id: string
  is_recurring?: boolean
}

// report_id → 日付 / 担当者
const reports: [string, string, string][] = [
  ['r0901', '2026-09-01', 'me'],
  ['r0903', '2026-09-03', 'me'],
  ['r0905', '2026-09-05', 'me'],
  ['r0909', '2026-09-09', 'me'],
  ['r0909-other', '2026-09-09', 'someone-else'],
]
const dateMap = new Map(reports.map(([id, d]) => [id, d]))
const userMap = new Map(reports.map(([id, , u]) => [id, u]))
const reportIds = reports.map(([id]) => id)

const allRows: Row[] = [
  // A: 期日超過のまま進捗が動いていない（9/1 から 0% のまま）→ 出る
  { id: 'a1', title: 'A 放置', due_date: '2026-09-02', progress_rate: 0, task_status: '未着手', report_id: 'r0901' },
  { id: 'a2', title: 'A 放置', due_date: '2026-09-02', progress_rate: 0, task_status: '未着手', report_id: 'r0909' },

  // B: 毎日引き継いで進捗が動いている → 出ない（対応中）
  { id: 'b1', title: 'B 進行中', due_date: '2026-09-02', progress_rate: 10, task_status: '進行中', report_id: 'r0901' },
  { id: 'b2', title: 'B 進行中', due_date: '2026-09-02', progress_rate: 60, task_status: '進行中', report_id: 'r0909' },

  // C: 後日completeにした → 出ない
  { id: 'c1', title: 'C 完了済', due_date: '2026-09-02', progress_rate: 30, task_status: '進行中', report_id: 'r0901' },
  { id: 'c2', title: 'C 完了済', due_date: '2026-09-02', progress_rate: 100, task_status: '完了', report_id: 'r0909' },

  // D: 定期タスク（期日超過・進捗0）→ 出ない
  { id: 'd1', title: 'D 定期', due_date: '2026-09-02', progress_rate: 0, task_status: '未着手', report_id: 'r0909', is_recurring: true },

  // E: 期日はまだ先だが 9/1 から進捗が動いていない（9日間）→ 出る（放置）
  { id: 'e1', title: 'E 期日先だが停滞', due_date: '2026-12-31', progress_rate: 20, task_status: '進行中', report_id: 'r0901' },
  { id: 'e2', title: 'E 期日先だが停滞', due_date: '2026-12-31', progress_rate: 20, task_status: '進行中', report_id: 'r0909' },

  // F: 期日はまだ先で、最近進捗が動いた → 出ない
  { id: 'f1', title: 'F 順調', due_date: '2026-12-31', progress_rate: 20, task_status: '進行中', report_id: 'r0905' },
  { id: 'f2', title: 'F 順調', due_date: '2026-12-31', progress_rate: 50, task_status: '進行中', report_id: 'r0909' },

  // G: 他人の同名タスクが完了していても、自分の分は影響を受けない
  { id: 'g1', title: 'A 放置', due_date: '2026-09-02', progress_rate: 100, task_status: '完了', report_id: 'r0909-other' },
]

// supabase クライアントの最小モック（.from().select().in().in().is() → { data }）
const fakeSupabase: any = {
  from: () => ({
    select: () => ({
      in: (_col: string, ids: string[]) => ({
        in: (_col2: string, titles: string[]) => ({
          is: async () => ({ data: allRows.filter(r => ids.includes(r.report_id) && titles.includes(r.title)) }),
        }),
      }),
    }),
  }),
}

async function main() {
  const candidates = allRows.filter(r => r.progress_rate < 100)
  const judged = await filterCurrentOverdue(fakeSupabase, candidates, reportIds, dateMap, userMap, today)
  const got = judged.map(j => j.task.id).sort()
  const reasonOf = (id: string) => judged.find(j => j.task.id === id)?.reason

  console.log('停滞とみなす日数:', STALE_DAYS)
  console.log('出たタスク:', judged.map(j => `${j.task.id}(${j.reason}/${j.staleDays}日)`).join(', ') || 'なし')

  const cases: [string, boolean][] = [
    ['A 期日超過で放置 → 出る', got.includes('a2')],
    ['A の理由は期日超過', reasonOf('a2') === 'overdue'],
    ['A の古い行は出ない', !got.includes('a1')],
    ['B 進捗が動いている → 出ない', !got.includes('b1') && !got.includes('b2')],
    ['C 後で完了 → 出ない', !got.includes('c1') && !got.includes('c2')],
    ['D 定期タスク → 出ない', !got.includes('d1')],
    ['E 期日は先でも停滞 → 出る', got.includes('e2')],
    ['E の理由は停滞', reasonOf('e2') === 'stale'],
    ['F 順調 → 出ない', !got.includes('f1') && !got.includes('f2')],
    ['G 他人の完了は影響しない', got.includes('a2')],
  ]
  let fail = 0
  for (const [name, ok] of cases) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`) }
  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
  process.exit(fail ? 1 : 0)
}
main()
