// 期日遅れタスクの「現在も未完了か」判定（src/lib/overdue-tasks.ts）の検証。実行: npx tsx scripts/test-overdue-filter.ts
import { filterCurrentOverdue, type OverdueCandidate } from '../src/lib/overdue-tasks'

const row = (o: Partial<OverdueCandidate> & { id: string; title: string; report_date: string; user_id: string }): OverdueCandidate => ({
  due_date: null, progress_rate: 0, task_status: '進行中', report_id: 'r-' + o.id, user_name: '', ...o,
})

// report_tasks の全行（同名タスクが複数日報にまたがる状況を再現）
const allRows: OverdueCandidate[] = [
  // A: 9/1 で 0% → 9/5 で 100%/完了 → 期日遅れから消えるべき
  row({ id: 'a1', title: '【熊本】チケット', due_date: '2026-09-01', progress_rate: 0,   report_date: '2026-09-01', user_id: 'me' }),
  row({ id: 'a2', title: '【熊本】チケット', due_date: '2026-09-01', progress_rate: 100, task_status: '完了', report_date: '2026-09-05', user_id: 'me' }),
  // B: 9/1 で 30% → 9/5 で 60%（まだ未完了）→ 最新行 b2 だけ残るべき
  row({ id: 'b1', title: 'バナー変更', due_date: '2026-09-03', progress_rate: 30, report_date: '2026-09-01', user_id: 'me' }),
  row({ id: 'b2', title: 'バナー変更', due_date: '2026-09-03', progress_rate: 60, report_date: '2026-09-05', user_id: 'me' }),
  // C: 9/1 で期日超過 → 9/5 で期日を延長（due 9/30、候補外）→ 古い行 c1 は消えるべき
  row({ id: 'c1', title: 'OHP関連', due_date: '2026-09-02', progress_rate: 40, report_date: '2026-09-01', user_id: 'me' }),
  row({ id: 'c2', title: 'OHP関連', due_date: '2026-09-30', progress_rate: 40, report_date: '2026-09-05', user_id: 'me' }),
  // D: 1回しか出ていない未完了 → 残るべき
  row({ id: 'd1', title: '面談シート', due_date: '2026-09-04', progress_rate: 80, report_date: '2026-09-05', user_id: 'me' }),
  // E: 別のユーザーの同名タスク（完了）は自分の判定に影響しない
  row({ id: 'e1', title: 'バナー変更', due_date: '2026-09-03', progress_rate: 100, task_status: '完了', report_date: '2026-09-05', user_id: 'someone-else' }),
]
const today = '2026-09-10'
const candidates = allRows.filter(t => t.due_date! < today && t.progress_rate < 100)

// supabase クライアントの最小モック（.from().select().in().is().eq().in() → { data }）。
// タスク名は URL の長さで分割して問い合わせるので、呼ばれた分をすべて記録する。
const askedTitles: string[][] = []
function mockQuery(titles: string[]) {
  const result = {
    is: () => result,
    eq: () => result,
    in: () => result,
    // 実際の PostgREST は reports を入れ子で返すので、その形に揃える
    then: (resolve: (v: any) => void) =>
      resolve({
        data: allRows.filter(r => titles.includes(r.title)).map(r => ({
          id: r.id, title: r.title, progress_rate: r.progress_rate, task_status: r.task_status,
          report_id: r.report_id, reports: { report_date: r.report_date, user_id: r.user_id },
        })),
        error: null,
      }),
  }
  return result
}
const fakeSupabase: any = {
  from: () => ({
    select: () => ({
      in: (_col: string, titles: string[]) => { askedTitles.push(titles); return mockQuery(titles) },
    }),
  }),
}

const encodedCost = (part: string[]) => part.reduce((n, t) => n + encodeURIComponent(t).length + 3, 0)

// 長いタスク名だけでも予算内に割れるか（本番の最長タスク名は169文字）
const longTitle = 'あ'.repeat(169)
const longTitleChunks: string[][] = []
const oneHugeChunks: string[][] = []

async function main() {
  const probeLong: any = {
    from: () => ({ select: () => ({ in: (_c: string, t: string[]) => { longTitleChunks.push(t); return mockQuery([]) } }) }),
  }
  await filterCurrentOverdue(probeLong,
    Array.from({ length: 30 }, (_, i) => row({ id: 'L' + i, title: longTitle + i, report_date: '2026-09-01', user_id: 'me' })),
    { kind: 'user', userId: 'me' })

  const probeHuge: any = {
    from: () => ({ select: () => ({ in: (_c: string, t: string[]) => { oneHugeChunks.push(t); return mockQuery([]) } }) }),
  }
  await filterCurrentOverdue(probeHuge,
    [row({ id: 'H1', title: 'あ'.repeat(2000), report_date: '2026-09-01', user_id: 'me' })],
    { kind: 'user', userId: 'me' })

  const result = await filterCurrentOverdue(fakeSupabase, candidates, { kind: 'user', userId: 'me' })
  const got = result.map(t => t.id).sort()
  const expected = ['b2', 'd1'].sort()
  console.log('候補:', candidates.map(t => t.id).join(','), '→ 残る:', got.join(','))
  const cases: [string, boolean][] = [
    ['A 後日完了 → 消える', !got.includes('a1')],
    ['B 未完了のまま → 最新行だけ残る', got.includes('b2') && !got.includes('b1')],
    ['C 期日延長 → 古い行が消える', !got.includes('c1')],
    ['D 1回だけの未完了 → 残る', got.includes('d1')],
    ['E 他人の同名完了は影響しない', got.includes('b2')],
    ['F 1リクエストのタスク名はURL予算内に収まる', askedTitles.every(part => encodedCost(part) <= 3000)],
    ['G 長いタスク名ばかりでも予算内に分割される', longTitleChunks.every(part => encodedCost(part) <= 3000) && longTitleChunks.length > 1],
    ['H 1件で予算を超えるタスク名も落とさず送る', oneHugeChunks.length === 1 && oneHugeChunks[0].length === 1],
  ]
  let fail = 0
  for (const [name, ok] of cases) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`) }
  console.log(JSON.stringify(got) === JSON.stringify(expected) && fail === 0 ? 'ALL PASS' : `${fail} FAILED (got ${got})`)
  process.exit(fail ? 1 : 0)
}
main()
