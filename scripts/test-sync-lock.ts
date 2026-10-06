// 同期ロック（try_sync_lock / release_sync_lock）の検証。
// 実行: npx tsx scripts/test-sync-lock.ts
// 検証用の専用キーを使うので、実際の同期ロック（tasukaru_sync）には触れない。
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = 'test_lock_' + Date.now()

async function tryLock(staleSeconds?: number) {
  const args: Record<string, unknown> = { p_key: KEY }
  if (staleSeconds !== undefined) args.p_stale_seconds = staleSeconds
  const { data, error } = await supabase.rpc('try_sync_lock', args)
  if (error) throw new Error(`try_sync_lock: ${error.message}`)
  return data as boolean
}
async function release() {
  const { data, error } = await supabase.rpc('release_sync_lock', { p_key: KEY })
  if (error) throw new Error(`release_sync_lock: ${error.message}`)
  return data as boolean
}

async function main() {
  const cases: [string, boolean, string][] = []

  const first = await tryLock()
  const second = await tryLock()
  cases.push(['最初の1回は取れる', first === true, String(first)])
  cases.push(['すでに取られていたら取れない', second === false, String(second)])

  // 別の接続から解放できる（advisory lock ではこれができなかった）
  const other = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: releasedByOther, error: relErr } = await other.rpc('release_sync_lock', { p_key: KEY })
  if (relErr) throw relErr
  cases.push(['別の接続からでも解放できる', releasedByOther === true, String(releasedByOther)])

  const afterRelease = await tryLock()
  cases.push(['解放したら再び取れる', afterRelease === true, String(afterRelease)])

  // 取り残されても時間切れで次が取れる
  const staleTakeover = await tryLock(0)
  cases.push(['取り残されても時間切れで奪える', staleTakeover === true, String(staleTakeover)])

  // 時間切れ前は奪えない
  const notStale = await tryLock(3600)
  cases.push(['時間切れ前は奪えない', notStale === false, String(notStale)])

  await release()
  const cleaned = await release()
  cases.push(['すでに無いロックの解放は false', cleaned === false, String(cleaned)])

  // 後始末の確認
  const { count } = await supabase.from('sync_locks').select('key', { count: 'exact', head: true }).eq('key', KEY)
  cases.push(['検証用のロック行が残らない', count === 0, `${count}件`])

  let fail = 0
  for (const [n, ok, d] of cases) { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` → ${d}` : ''}`) }
  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
  process.exit(fail ? 1 : 0)
}
main()
