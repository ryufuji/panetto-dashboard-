/**
 * 期日遅れタスクの取得。判定そのものは DB 側の overdue_tasks 関数が行う
 * （supabase/migrations/00031_overdue_tasks_function.sql）。
 *
 * 同じタスクは日報ごとに report_tasks の行が分かれるため、期日超過・進捗100%未満の行を
 * そのまま並べると、後日の日報で完了にしたタスクの古い行が残り続ける。
 * 「同じ人・同じタスク名」の最新の日報の行だけを見て判定する必要がある。
 *
 * これをクライアント側でやると、候補となる行が組織全体で約2,000件あり、PostgREST が
 * 1リクエストで返せる1000行を超えるため、直近の期日超過を取りこぼしていた。
 * DB 側で先に最新行へ絞れば、返るのは百件程度で済む。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 誰の分を見るか。日報作成画面と一覧の「自分のみ」は user、一覧の「組織全体」は org。 */
export type OverdueScope =
  | { kind: 'user'; userId: string }
  | { kind: 'org'; organizationId: string }

/** 何日進捗が動かなければ「止まっている」とみなすか。 */
export const STALE_DAYS = 7

export interface OverdueTask {
  id: string
  title: string
  due_date: string | null
  progress_rate: number
  task_status: string | null
  report_id: string
  report_date: string
  user_id: string
  user_name: string
  /** 期日を過ぎている */
  is_overdue: boolean
  /** 期日の有無によらず、進捗が STALE_DAYS 日以上動いていない（毎日引き継ぐ定期タスクは除く） */
  is_stale: boolean
  /** 同じ進捗率のまま何日経ったか。is_stale のときだけ入る */
  stale_days: number | null
}

/**
 * 期日遅れタスクを取得する。
 * includeStale を立てると、期日は過ぎていないが進捗が止まっているものも含める。
 */
export async function fetchOverdueTasks(
  supabase: SupabaseClient,
  scope: OverdueScope,
  today: string,
  includeStale: boolean,
): Promise<OverdueTask[]> {
  const { data, error } = await supabase.rpc('overdue_tasks', {
    p_today: today,
    p_user_id: scope.kind === 'user' ? scope.userId : null,
    p_org_id: scope.kind === 'org' ? scope.organizationId : null,
    p_stale_days: STALE_DAYS,
  })
  if (error) throw error

  const rows = ((data || []) as any[]).map(t => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    progress_rate: t.progress_rate ?? 0,
    task_status: t.task_status,
    report_id: t.report_id,
    report_date: t.report_date,
    user_id: t.user_id,
    user_name: t.user_name || '',
    is_overdue: !!t.is_overdue,
    is_stale: !!t.is_stale,
    stale_days: t.stale_days ?? null,
  }))
  return includeStale ? rows : rows.filter(t => t.is_overdue)
}
