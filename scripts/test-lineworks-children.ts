// 日報の提出通知で、子タスクの詳細まで本文に出るかの検証。
// 実行: npx tsx scripts/test-lineworks-children.ts
import { formatReportSubmittedMessage } from '../src/lib/lineworks'

const msg = formatReportSubmittedMessage({
  reportDate: '2026-10-08',
  userName: '大串 里江',
  department: '東京',
  startTime: '08:30',
  endTime: '18:16',
  tasks: [{
    title: '女子求人入店単価',
    task_status: '進行中',
    progress_rate: 10,
    estimated_hours: null,
    memo: '入店単価目標：「75,367円」以下',
    due_date: '2027-02-28',
    children: [
      { title: '10月画像(確認、修正依頼)', progress_rate: 70, actual_hours: 3.5, memo: 'PS変更依頼まで完了', due_date: '2026-10-10' },
      { title: '駅ちか×バニラ連携', progress_rate: 0, actual_hours: 0.5, memo: null, description: null, due_date: null },
    ],
  }],
  plannedTasks: [],
} as any)

console.log('--- 生成された本文 ---')
console.log(msg)
console.log('----------------------')

const cases: [string, boolean][] = [
  ['親のタイトルが出る', msg.includes('女子求人入店単価')],
  ['親のメモが出る', msg.includes('入店単価目標')],
  ['子のタイトルが出る', msg.includes('10月画像(確認、修正依頼)')],
  ['子の進捗が出る', msg.includes('進捗70％')],
  ['子の実績時間が出る', msg.includes('実績3.5h')],
  ['子の期日が出る', msg.includes('期日2026-10-10')],
  ['子のメモが出る', msg.includes('PS変更依頼まで完了')],
  ['メモが無い子でも落ちない', msg.includes('駅ちか×バニラ連携')],
]
let fail = 0
for (const [n, ok] of cases) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`) }
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
process.exit(fail ? 1 : 0)
