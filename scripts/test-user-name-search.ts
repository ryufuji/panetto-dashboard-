// 日報一覧の氏名検索（reports/page.tsx）が、空白の有無によらず同じ人を見つけられるかの検証。
// 実行: npx tsx scripts/test-user-name-search.ts
// 読み取りのみ。
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

/** 画面と同じ絞り込み */
async function search(userQuery: string) {
  const normalizedQuery = userQuery.replace(/[\s　・]/g, '')
  const escaped = (v: string) => v.replace(/[,()]/g, ' ')
  const { data, error } = await supabase
    .from('users')
    .select('id, name')
    .or(`name.ilike.%${escaped(userQuery)}%,name_searchable.ilike.%${escaped(normalizedQuery)}%`)
    .limit(500)
  if (error) throw new Error(`検索に失敗: ${error.message}`)
  return (data || []).map((u: any) => u.name)
}

async function main() {
  const { data: people } = await supabase.from('users').select('name').like('name', '% %').limit(5)
  const names = (people || []).map((p: any) => p.name as string)
  console.log('検証に使う氏名:', names.join(' / '))

  const cases: [string, boolean, string][] = []
  for (const full of names) {
    const noSpace = full.replace(/\s/g, '')
    const sei = full.split(/\s+/)[0]
    const [withSpace, without, surnameOnly] = await Promise.all([search(full), search(noSpace), search(sei)])
    cases.push([`「${full}」でヒットする`, withSpace.includes(full), withSpace.join(',')])
    cases.push([`「${noSpace}」（空白なし）でもヒットする`, without.includes(full), without.join(',') || '0件'])
    cases.push([`「${sei}」（姓のみ）でもヒットする`, surnameOnly.includes(full), surnameOnly.join(',') || '0件'])
  }
  // 関係ない語では出ない
  const none = await search('ざざざざ存在しない名前')
  cases.push(['存在しない語では0件になる', none.length === 0, `${none.length}件`])

  let fail = 0
  for (const [name, ok, detail] of cases) {
    if (!ok) fail++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` → ${detail}`}`)
  }
  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILED`)
  process.exit(fail ? 1 : 0)
}
main()
