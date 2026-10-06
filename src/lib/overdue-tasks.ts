/**
 * 期日遅れタスクの「現在も未完了か」判定。
 *
 * 同じタスクは日報ごとに report_tasks の行が分かれるため、期日超過・進捗100%未満の行を
 * そのまま並べると、後日の日報で完了にしたタスクの古い行が残り続ける。
 * 「同じ人・同じタスク名」の最新の日報の行で状態を判定し、
 *   - 最新行が完了（100% または task_status='完了'）→ 除外
 *   - 候補より新しい行がある（期日延長など）→ 候補は除外（最新行側で判定される）
 * とする。期日遅れ一覧ページと、日報作成の「翌日以降の予定」タブの両方で使う。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface OverdueCandidate {
  id: string
  title: string
  due_date: string | null
  progress_rate: number
  task_status: string | null
  report_id: string
}

export async function filterCurrentOverdue<T extends OverdueCandidate>(
  supabase: SupabaseClient,
  candidates: T[],
  reportIds: string[],
  reportDateById: Map<string, string>,
  userIdByReportId: Map<string, string>,
): Promise<T[]> {
  const titles = [...new Set(candidates.map(t => (t.title || '').trim()).filter(Boolean))]
  if (titles.length === 0) return candidates

  // ユーザーIDとタスク名を区切り文字で連結してキーにする（タスク名に含まれない文字を使う）
  const key = (userId: string | undefined, title: string) => `${userId ?? ''}${title.trim()}`
  const latestByKey = new Map<string, { id: string; report_date: string; progress_rate: number; task_status: string | null }>()

  const { data: sameTitle } = await supabase
    .from('report_tasks')
    .select('id, title, progress_rate, task_status, report_id')
    .in('report_id', reportIds)
    .in('title', titles)
    .is('parent_task_id', null)
  for (const t of (sameTitle || []) as OverdueCandidate[]) {
    const k = key(userIdByReportId.get(t.report_id), t.title)
    const rd = reportDateById.get(t.report_id) || ''
    const cur = latestByKey.get(k)
    if (!cur || rd > cur.report_date) latestByKey.set(k, { id: t.id, report_date: rd, progress_rate: t.progress_rate ?? 0, task_status: t.task_status })
  }

  return candidates.filter(t => {
    const latest = latestByKey.get(key(userIdByReportId.get(t.report_id), t.title))
    if (!latest) return true
    if (latest.id !== t.id) return false
    return (latest.progress_rate ?? 0) < 100 && latest.task_status !== '完了'
  })
}
