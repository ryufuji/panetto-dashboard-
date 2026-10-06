/**
 * 期日遅れタスクの取得と「現在も未完了か」の判定。
 *
 * 同じタスクは日報ごとに report_tasks の行が分かれるため、期日超過・進捗100%未満の行を
 * そのまま並べると、後日の日報で完了にしたタスクの古い行が残り続ける。
 * 「同じ人・同じタスク名」の最新の日報の行で状態を判定し、
 *   - 最新行が完了（100% または task_status='完了'）→ 除外
 *   - 候補より新しい行がある（期日延長など）→ 候補は除外（最新行側で判定される）
 * とする。期日遅れ一覧ページと、日報作成の「翌日以降の予定」タブの両方で使う。
 *
 * 日報の件数は増え続けるので、日報IDを集めてから .in('report_id', [...]) で絞る方式は使わない。
 * PostgREST は既定で1000行までしか返さないうえ、1000件のIDをクエリ文字列に載せると
 * URL が長くなりすぎてリクエストが 400 で落ちる。reports を内部結合して絞り込む。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 誰の分を見るか。自分の画面は user、期日遅れ一覧の「組織全体」は org。 */
export type OverdueScope =
  | { kind: 'user'; userId: string }
  | { kind: 'org'; organizationId: string }

const VISIBLE_STATUS = ['submitted', 'approved']

/**
 * タスク名をまとめてクエリ文字列に載せすぎるとリクエストが落ちるため、分割して問い合わせる。
 * 本番で実測したところ URL 7,300 文字は通り、9,770 文字で落ちた。
 * タスク名は日本語なので URL エンコードで1文字あたり9文字まで膨らむ。件数ではなく長さで区切る。
 */
const TITLE_QUERY_BUDGET = 3000

export interface OverdueCandidate {
  id: string
  title: string
  due_date: string | null
  progress_rate: number
  task_status: string | null
  report_id: string
  report_date: string
  user_id: string
  user_name: string
}

function withScope(query: any, scope: OverdueScope) {
  const scoped = scope.kind === 'user'
    ? query.eq('reports.user_id', scope.userId)
    : query.eq('reports.organization_id', scope.organizationId)
  return scoped.in('reports.status', VISIBLE_STATUS)
}

function chunkByEncodedLength(titles: string[], budget: number): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let used = 0
  for (const title of titles) {
    const cost = encodeURIComponent(title).length + 3 // 引用符とカンマの分
    if (current.length > 0 && used + cost > budget) {
      chunks.push(current)
      current = []
      used = 0
    }
    current.push(title)
    used += cost
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** ユーザーとタスク名の組をキーにする。タスク名に現れない文字で区切る。 */
function latestKey(userId: string | null | undefined, title: string) {
  return `${userId ?? ''}\u0000${title.trim()}`
}

/** 期日を過ぎた未完了タスクの候補を、期日の古い順に取得する。 */
export async function fetchOverdueCandidates(
  supabase: SupabaseClient,
  scope: OverdueScope,
  today: string,
  limit: number,
): Promise<OverdueCandidate[]> {
  const query = supabase
    .from('report_tasks')
    .select('id, title, due_date, progress_rate, task_status, report_id, reports!inner(report_date, user_id, status, organization_id, users(name))')
    .lt('due_date', today)
    .lt('progress_rate', 100)
    .is('parent_task_id', null)
    .order('due_date', { ascending: true })
    .limit(limit)

  const { data, error } = await withScope(query, scope)
  if (error) throw error
  return ((data || []) as any[]).map(t => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    progress_rate: t.progress_rate ?? 0,
    task_status: t.task_status,
    report_id: t.report_id,
    report_date: t.reports?.report_date || '',
    user_id: t.reports?.user_id || '',
    user_name: t.reports?.users?.name || '',
  }))
}

export async function filterCurrentOverdue<T extends OverdueCandidate>(
  supabase: SupabaseClient,
  candidates: T[],
  scope: OverdueScope,
): Promise<T[]> {
  const titles = [...new Set(candidates.map(t => (t.title || '').trim()).filter(Boolean))]
  if (titles.length === 0) return candidates

  const latestByKey = new Map<string, { id: string; report_date: string; progress_rate: number; task_status: string | null }>()

  const pages = await Promise.all(chunkByEncodedLength(titles, TITLE_QUERY_BUDGET).map(async part => {
    const query = supabase
      .from('report_tasks')
      .select('id, title, progress_rate, task_status, report_id, reports!inner(report_date, user_id, status, organization_id)')
      .in('title', part)
      .is('parent_task_id', null)
    const { data, error } = await withScope(query, scope)
    if (error) throw error
    return (data || []) as any[]
  }))

  for (const row of pages.flat()) {
    const k = latestKey(row.reports?.user_id, row.title)
    const reportDate = row.reports?.report_date || ''
    const current = latestByKey.get(k)
    if (!current || reportDate > current.report_date) {
      latestByKey.set(k, { id: row.id, report_date: reportDate, progress_rate: row.progress_rate ?? 0, task_status: row.task_status })
    }
  }

  return candidates.filter(t => {
    const latest = latestByKey.get(latestKey(t.user_id, t.title))
    if (!latest) return true
    if (latest.id !== t.id) return false
    return (latest.progress_rate ?? 0) < 100 && latest.task_status !== '完了'
  })
}
