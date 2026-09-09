// 定期タスクの発火判定 recurrenceFires の検証。実行: npx tsx scripts/test-recurrence.ts
import { recurrenceFires, RECURRENCE_PATTERNS } from '../src/types/report'
const cases: [string, string, string, boolean][] = [
  // pattern, anchor, today, expected
  ['monthly',    '2026-01-15', '2026-02-15', true],
  ['monthly',    '2026-01-15', '2026-02-16', false],
  ['monthly',    '2026-01-31', '2026-02-28', true],   // 月末繰り上げ
  ['bimonthly',  '2026-01-15', '2026-02-15', false],
  ['bimonthly',  '2026-01-15', '2026-03-15', true],
  ['bimonthly',  '2026-01-15', '2026-05-15', true],
  ['quarterly',  '2026-01-10', '2026-04-10', true],
  ['quarterly',  '2026-01-10', '2026-03-10', false],
  ['quarterly',  '2026-01-10', '2026-07-10', true],
  ['semiannual', '2026-01-10', '2026-07-10', true],
  ['semiannual', '2026-01-10', '2026-04-10', false],
  ['yearly',     '2025-09-09', '2026-09-09', true],
  ['yearly',     '2025-09-09', '2026-03-09', false],
  ['yearly',     '2024-02-29', '2025-02-28', true],   // うるう日→月末
  ['quarterly',  '2026-01-31', '2026-04-30', true],   // 月末繰り上げ
  ['quarterly',  '2026-01-15', '2026-01-15', false],  // 同日は発火しない
  ['daily',      '2026-01-15', '2026-01-16', true],
  ['weekly',     '2026-01-15', '2026-01-22', true],
  ['biweekly',   '2026-01-15', '2026-01-22', false],
  ['unknown',    '2026-01-15', '2026-02-15', false],
]
let fail = 0
for (const [p, a, t, exp] of cases) {
  const got = recurrenceFires(p, a, t)
  if (got !== exp) { fail++; console.log(`FAIL ${p} ${a}→${t} expected ${exp} got ${got}`) }
}
console.log(`patterns: ${RECURRENCE_PATTERNS.map(p => p.value).join(',')}`)
console.log(fail === 0 ? `ALL ${cases.length} PASS` : `${fail} FAILED`)
