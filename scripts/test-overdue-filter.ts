// 期日遅れタスクの「現在も未完了か」判定（src/lib/overdue-tasks.ts）の検証。実行: npx tsx scripts/test-overdue-filter.ts
import { filterCurrentOverdue, type OverdueCandidate } from '../src/lib/overdue-tasks'

// report_tasks の全行（同名タスクが複数日報にまたがる状況を再現）
const allRows: OverdueCandidate[] = [
  // A: 9/1 で 0% → 9/5 で 100%/完了 → 期日遅れから消えるべき
  { id: 'a1', title: '【熊本】チケット', due_date: '2026-09-01', progress_rate: 0,   task_status: '進行中', report_id: 'r0901' },
  { id: 'a2', title: '【熊本】チケット', due_date: '2026-09-01', progress_rate: 100, task_status: '完了',   report_id: 'r0905' },
  // B: 9/1 で 30% → 9/5 で 60%（まだ未完了）→ 最新行 b2 だけ残るべき
  { id: 'b1', title: 'バナー変更', due_date: '2026-09-03', progress_rate: 30, task_status: '進行中', report_id: 'r0901' },
  { id: 'b2', title: 'バナー変更', due_date: '2026-09-03', progress_rate: 60, task_status: '進行中', report_id: 'r0905' },
  // C: 9/1 で期日超過 → 9/5 で期日を延長（due 9/30、候補外）→ 古い行 c1 は消えるべき
  { id: 'c1', title: 'OHP関連', due_date: '2026-09-02', progress_rate: 40, task_status: '進行中', report_id: 'r0901' },
  { id: 'c2', title: 'OHP関連', due_date: '2026-09-30', progress_rate: 40, task_status: '進行中', report_id: 'r0905' },
  // D: 1回しか出ていない未完了 → 残るべき
  { id: 'd1', title: '面談シート', due_date: '2026-09-04', progress_rate: 80, task_status: '進行中', report_id: 'r0905' },
  // E: 別のユーザーの同名タスク（完了）は自分の判定に影響しない
  { id: 'e1', title: 'バナー変更', due_date: '2026-09-03', progress_rate: 100, task_status: '完了', report_id: 'r0905-other' },
]
const today = '2026-09-10'
const candidates = allRows.filter(t => t.due_date! < today && t.progress_rate < 100)
const reportIds = ['r0901', 'r0905', 'r0905-other']
const dateMap = new Map([['r0901', '2026-09-01'], ['r0905', '2026-09-05'], ['r0905-other', '2026-09-05']])
const userMap = new Map([['r0901', 'me'], ['r0905', 'me'], ['r0905-other', 'someone-else']])

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
  const result = await filterCurrentOverdue(fakeSupabase, candidates, reportIds, dateMap, userMap)
  const got = result.map(t => t.id).sort()
  const expected = ['b2', 'd1'].sort()
  console.log('候補:', candidates.map(t => t.id).join(','), '→ 残る:', got.join(','))
  const cases: [string, boolean][] = [
    ['A 後日完了 → 消える', !got.includes('a1')],
    ['B 未完了のまま → 最新行だけ残る', got.includes('b2') && !got.includes('b1')],
    ['C 期日延長 → 古い行が消える', !got.includes('c1')],
    ['D 1回だけの未完了 → 残る', got.includes('d1')],
    ['E 他人の同名完了は影響しない', got.includes('b2')],
  ]
  let fail = 0
  for (const [name, ok] of cases) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`) }
  console.log(JSON.stringify(got) === JSON.stringify(expected) && fail === 0 ? 'ALL PASS' : `${fail} FAILED (got ${got})`)
  process.exit(fail ? 1 : 0)
}
main()
