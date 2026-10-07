// PANET の在籍状況と、認証側のBAN状態を合わせるロジックの検証。
// 実行: npx tsx scripts/test-panet-ban-sync.ts
// DB には触れない。webhook が BAN を付け外しする条件だけを確かめる。

/** webhook (api/webhooks/panet-users) と同じ判定 */
function decide(isArchived: boolean, bannedUntilRaw: string | undefined, now = Date.now()) {
  const isBanned = !!bannedUntilRaw && new Date(bannedUntilRaw).getTime() > now
  const changed = isArchived !== isBanned
  return {
    changed,
    action: changed ? (isArchived ? 'BANする' : 'BANを解除する') : '何もしない',
  }
}

const 未来 = new Date(Date.now() + 100 * 365 * 864e5).toISOString()
const 過去 = new Date(Date.now() - 864e5).toISOString()

const cases: [string, ReturnType<typeof decide>, string][] = [
  ['退職者がまだBANされていない → BANする', decide(true, undefined), 'BANする'],
  ['退職者が既にBAN済み → 触らない', decide(true, 未来), '何もしない'],
  ['在職者が誤ってBANされている → 解除する（今回の小林さんの状況）', decide(false, 未来), 'BANを解除する'],
  ['在職者がBANされていない → 触らない', decide(false, undefined), '何もしない'],
  ['BAN期限が切れている在職者 → 触らない', decide(false, 過去), '何もしない'],
  ['BAN期限が切れた退職者 → 再度BANする', decide(true, 過去), 'BANする'],
]

let fail = 0
for (const [name, got, want] of cases) {
  const ok = got.action === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` → ${got.action}（期待: ${want}）`}`)
}
console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
process.exit(fail ? 1 : 0)
