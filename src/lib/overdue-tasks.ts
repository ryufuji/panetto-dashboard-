/**
 * 期日遅れタスクの「いま対応が必要か」判定。
 *
 * 同じタスクは日報ごとに report_tasks の行が分かれるため、期日超過・進捗100%未満の行を
 * そのまま並べると、後日の日報で完了にしたタスクの古い行が残り続ける。
 * 「同じ人・同じタスク名」の最新の日報の行で状態を判定する。
 *
 * さらに、毎日引き継いで実際に手を動かしているタスクは「遅れ」ではないので除外する。
 * 引き継ぎのたびに期日が当日へ書き換わる作りのため、期日だけで見ると
 *   - 毎日進めているタスク → 期日が当日に更新され続けて一覧に出てこない
 *   - 毎日コピーされるだけで放置されているタスク → 同じく出てこない
 * の両方が隠れてしまう。そこで進捗の推移を見て、
 *   - 直近 STALE_DAYS 日で進捗が動いている → 除外（対応中なので遅れではない）
 *   - 期日超過、または STALE_DAYS 日以上 進捗が動いていない → 対象
 * とする。定期タスクは繰り返す前提なので対象外。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 何日間 進捗が動かなければ「放置」とみなすか */
export const STALE_DAYS = 7

export type OverdueReason = 'overdue' | 'stale'

export interface OverdueCandidate {
  id: string
  title: string
  due_date: string | null
  progress_rate: number
  task_status: string | null
  report_id: string
}

export interface OverdueJudged<T> {
  task: T
  reason: OverdueReason
  /** 進捗が動いていない日数（stale のときのみ意味を持つ） */
  staleDays: number
}

function daysBetween(fromISO: string, toISO: string) {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime()
  const b = new Date(`${toISO}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export async function filterCurrentOverdue<T extends OverdueCandidate>(
  supabase: SupabaseClient,
  candidates: T[],
  reportIds: string[],
  reportDateById: Map<string, string>,
  userIdByReportId: Map<string, string>,
  today?: string,
): Promise<OverdueJudged<T>[]> {
  const titles = [...new Set(candidates.map(t => (t.title || '').trim()).filter(Boolean))]
  if (titles.length === 0) return []
  const todayStr = today || new Date().toISOString().slice(0, 10)

  // ユーザーIDとタスク名を「\u0000」で連結してキーにする（タスク名に現れない文字）
  const key = (userId: string | undefined, title: string) => `${userId ?? ''}\u0000${title.trim()}`

  type Row = { id: string; report_date: string; progress_rate: number; task_status: string | null; is_recurring: boolean }
  const historyByKey = new Map<string, Row[]>()

  const { data: sameTitle } = await supabase
    .from('report_tasks')
    .select('id, title, progress_rate, task_status, report_id, is_recurring')
    .in('report_id', reportIds)
    .in('title', titles)
    .is('parent_task_id', null)

  for (const t of (sameTitle || []) as (OverdueCandidate & { is_recurring?: boolean })[]) {
    const k = key(userIdByReportId.get(t.report_id), t.title)
    const arr = historyByKey.get(k) || []
    arr.push({
      id: t.id,
      report_date: reportDateById.get(t.report_id) || '',
      progress_rate: t.progress_rate ?? 0,
      task_status: t.task_status,
      is_recurring: !!t.is_recurring,
    })
    historyByKey.set(k, arr)
  }
  for (const arr of historyByKey.values()) arr.sort((a, b) => a.report_date.localeCompare(b.report_date))

  const judged: OverdueJudged<T>[] = []
  for (const t of candidates) {
    const history = historyByKey.get(key(userIdByReportId.get(t.report_id), t.title))
    if (!history || history.length === 0) continue
    const latest = history[history.length - 1]
    // 最新行以外は、最新行の側で判定するのでここでは扱わない
    if (latest.id !== t.id) continue
    if (latest.progress_rate >= 100 || latest.task_status === '完了') continue
    // 定期タスクは繰り返す前提なので期日遅れの対象にしない
    if (latest.is_recurring) continue

    // 最新の進捗値になってから何日経ったか（＝進捗が動いていない日数）
    let since = latest.report_date
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].progress_rate !== latest.progress_rate) break
      since = history[i].report_date
    }
    const staleDays = daysBetween(since, todayStr)

    // 複数回引き継がれていて、直近 STALE_DAYS 日のうちに進捗が動いている＝対応中。
    // 期日を過ぎていても「遅れ」ではなく進行中なので出さない。
    const recentlyProgressed = history.length > 1 && staleDays < STALE_DAYS
    if (recentlyProgressed) continue

    const isOverdue = !!t.due_date && t.due_date < todayStr
    const isStale = staleDays >= STALE_DAYS
    if (!isOverdue && !isStale) continue

    judged.push({ task: t, reason: isOverdue ? 'overdue' : 'stale', staleDays })
  }
  return judged
}
