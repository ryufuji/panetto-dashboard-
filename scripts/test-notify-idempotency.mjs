// LINE WORKS 通知の冪等判定（notify-submission/route.ts と同じ式）の検証。実行: node scripts/test-notify-idempotency.mjs
//
// 判定に submitted_at ではなく updated_at を使う: 提出済みの日報を編集しても
// submitted_at（最初に提出した日時）は据え置く仕様のため、submitted_at では
// 「その後に内容が更新されたか」を判定できない。
const decide = (notifiedAt, updatedAt) => {
  const n = notifiedAt ? new Date(notifiedAt).getTime() : 0
  const u = updatedAt ? new Date(updatedAt).getTime() : 0
  const isResubmit = n > 0
  if (isResubmit && u <= n + 5_000) return { action: 'skip' }
  return { action: 'send', isResubmit }
}
const stamp = (serverNow, updatedAt) => new Date(Math.max(new Date(serverNow).getTime(), new Date(updatedAt).getTime())).toISOString()

let fail = 0
const check = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`}`)
}

// 1) 初回提出（下書き→提出）→ 送る。再提出扱いではない
check('初回提出', decide(null, '2026-09-29T02:00:00Z'), { action: 'send', isResubmit: false })

// 2) 同じ保存に対する二重呼び出し → スキップ
let stamped = stamp('2026-09-29T02:00:05Z', '2026-09-29T02:00:00Z')
check('同一保存の二重呼び出し', decide(stamped, '2026-09-29T02:00:00Z'), { action: 'skip' })

// 3) クライアント時計が2分進んでいる（updated_at が未来）→ 記録は updated_at 側に揃う
stamped = stamp('2026-09-29T02:00:05Z', '2026-09-29T02:02:00Z')
check('時計が進んでいる: 記録は updated_at 側', stamped, '2026-09-29T02:02:00.000Z')
check('時計が進んでいる: 二重呼び出しはスキップ', decide(stamped, '2026-09-29T02:02:00Z'), { action: 'skip' })

// 4) 提出済みを編集して「更新して保存」→ 再提出として送る（submitted_at は据え置きでも判定できる）
check('提出済みの更新（40時間後）', decide('2026-09-27T10:00:00Z', '2026-09-29T02:00:00Z'), { action: 'send', isResubmit: true })

// 5) 通知直後3秒での再保存（時計ズレの範囲内）→ スキップ（誤って二重送信しない）
check('3秒後の再保存はスキップ', decide('2026-09-29T02:00:00Z', '2026-09-29T02:00:03Z'), { action: 'skip' })

// 6) 1分後に編集して更新 → 送る（再提出）
check('1分後の更新は送る', decide('2026-09-29T02:00:00Z', '2026-09-29T02:01:00Z'), { action: 'send', isResubmit: true })

// 7) 再提出後、同じ保存で再度呼ばれてもスキップ
stamped = stamp('2026-09-29T02:01:02Z', '2026-09-29T02:01:00Z')
check('再提出後の二重呼び出しはスキップ', decide(stamped, '2026-09-29T02:01:00Z'), { action: 'skip' })

// 8) 下書きに戻して再提出 → 送る（updated_at が更新されるため）
check('下書きに戻して再提出', decide('2026-09-29T02:00:00Z', '2026-09-29T05:00:00Z'), { action: 'send', isResubmit: true })

console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
process.exit(fail ? 1 : 0)
