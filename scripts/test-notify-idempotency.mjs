// LINE WORKS 通知の冪等判定（notify-submission/route.ts と同じ式）の検証。実行: node scripts/test-notify-idempotency.mjs
// notify-submission の冪等判定と、送信後の lineworks_notified_at 記録を再現する
const decide = (notifiedAt, submittedAt) => {
  const n = notifiedAt ? new Date(notifiedAt).getTime() : 0
  const s = submittedAt ? new Date(submittedAt).getTime() : 0
  const isResubmit = n > 0
  if (isResubmit && s <= n + 5_000) return { action: 'skip' }
  return { action: 'send', isResubmit }
}
const stamp = (serverNow, submittedAt) => new Date(Math.max(new Date(serverNow).getTime(), new Date(submittedAt).getTime())).toISOString()

let fail = 0
const check = (name, got, exp) => { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`}`) }

// 1) 初回提出 → 送る（再提出扱いではない）
check('初回提出', decide(null, '2026-09-11T00:40:50Z'), { action: 'send', isResubmit: false })

// 2) 同じ提出に対して2回目の呼び出し（サーバー時計で記録済み） → スキップ
let stamped = stamp('2026-09-11T00:40:55Z', '2026-09-11T00:40:50Z')   // 通常: notified > submitted
check('同一提出の二重呼び出し', decide(stamped, '2026-09-11T00:40:50Z'), { action: 'skip' })

// 3) クライアント時計が2分進んでいる場合（submitted_at が未来）→ 記録は submitted_at に揃う → 二重呼び出しはスキップ
stamped = stamp('2026-09-11T00:40:55Z', '2026-09-11T00:42:50Z')
check('時計が進んでいる: 記録は submitted_at 側', stamped, '2026-09-11T00:42:50.000Z')
check('時計が進んでいる: 二重呼び出しはスキップ', decide(stamped, '2026-09-11T00:42:50Z'), { action: 'skip' })

// 4) 大串さんのケース: 9/9 通知 → 9/11 に再提出 → 「再提出」として送る
check('40時間後の再提出（大串さん）', decide('2026-09-09T08:36:46Z', '2026-09-11T00:40:50Z'), { action: 'send', isResubmit: true })

// 5) 提出直後3秒で再提出（時計ズレの範囲内）→ スキップ（誤って二重送信しない）
check('3秒後の再提出はスキップ', decide('2026-09-11T00:40:50Z', '2026-09-11T00:40:53Z'), { action: 'skip' })

// 6) 提出から1分後に編集して再提出 → 送る（再提出）
check('1分後の再提出は送る', decide('2026-09-11T00:40:50Z', '2026-09-11T00:41:50Z'), { action: 'send', isResubmit: true })

// 7) 再提出後の記録 → さらに同じ提出で呼ばれてもスキップ
stamped = stamp('2026-09-11T00:41:52Z', '2026-09-11T00:41:50Z')
check('再提出後の二重呼び出しはスキップ', decide(stamped, '2026-09-11T00:41:50Z'), { action: 'skip' })

console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
process.exit(fail ? 1 : 0)
