export interface TaskApproval {
  enabled: boolean
  title: string
  description: string
  category: string
  custom_category: string
  amount: string
  equipment_purpose: string
  equipment_user: string
  approvers: string[]
  file_url: string
  existing_id?: string
  existing_status?: string
}

export interface DeadlineExtension {
  id: string
  report_task_id: string | null
  original_due_date: string
  proposed_due_date: string
  reason: string | null
  status: string
  approver_id: string
  approver_comment: string | null
  created_at: string
}

export interface Task {
  id: string
  db_id?: string
  title: string
  description: string
  estimated_hours: string
  actual_hours: string
  progress_rate: number
  task_type: string
  priority: string
  start_date: string
  due_date: string
  parent_id: string | null
  approval: TaskApproval
  deadline_extensions?: DeadlineExtension[]
  // v2 拡張フィールド (参考UI 互換)
  purpose?: string                     // 目的・背景
  memo?: string                        // 備考・メモ
  actual_url?: string                  // 進行中・実績URL
  task_status?: string                 // ステータス: 未着手/進行中/完了/保留
  target_norma_count?: string          // ノルマ目標 (件数)
  target_norma_amount?: string         // ノルマ目標 (金額)
  today_result_count?: string          // 今日の成果 (件数)
  today_result_amount?: string         // 今日の成果 (金額)
  no_norma?: boolean                   // ノルマなし
  no_due_date?: boolean                // 期日なし
  is_recurring?: boolean               // 定期タスク (ON のとき recurrence_pattern を参照)
  recurrence_pattern?: RecurrencePattern  // 'daily' | 'weekly' | 'biweekly' | 'monthly'
  is_omitted?: boolean                 // 省略
  shared_user_ids?: string[]           // 共有ユーザー (参照のみ)
}

export const TASK_STATUS_OPTIONS = ['未着手', '進行中', '完了', '保留'] as const
export type TaskStatus = typeof TASK_STATUS_OPTIONS[number]

// 定期タスクの繰り返しパターン
export const RECURRENCE_PATTERNS = [
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '週次（同曜日）' },
  { value: 'biweekly', label: '隔週（同曜日）' },
  { value: 'monthly', label: '月次（同日）' },
] as const
export type RecurrencePattern = typeof RECURRENCE_PATTERNS[number]['value']

/**
 * 指定パターンの定期タスクが、anchor 日付を起点として today に発火するかを判定。
 *   daily   : 常に true
 *   weekly  : today と anchor が同じ曜日
 *   biweekly: 同じ曜日 かつ 経過日数 / 7 が偶数 (anchor を 0 として)
 *   monthly : today と anchor が同じ日 (月末は最後の日扱い)
 */
export function recurrenceFires(
  pattern: RecurrencePattern | string | undefined | null,
  anchorISO: string | null | undefined,
  todayISO: string,
): boolean {
  const p = pattern || 'daily'
  if (!anchorISO) return p === 'daily'
  const a = new Date(anchorISO + 'T00:00:00Z')
  const t = new Date(todayISO + 'T00:00:00Z')
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return false
  if (t.getTime() <= a.getTime()) return false // 元と同じ日 or 過去なら発火しない

  const diffDays = Math.round((t.getTime() - a.getTime()) / 86400000)
  if (p === 'daily') return true
  if (p === 'weekly') return a.getUTCDay() === t.getUTCDay()
  if (p === 'biweekly') return a.getUTCDay() === t.getUTCDay() && Math.floor(diffDays / 7) % 2 === 0
  if (p === 'monthly') {
    // 月の日 (DOM) が一致。月末アンカー (29,30,31) は対象月の最終日に対応
    const aDom = a.getUTCDate()
    const tDom = t.getUTCDate()
    if (aDom === tDom) return true
    // 月末対応: anchor=31 で today が 28-30(その月の最終日) でもマッチ
    const lastDom = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
    return aDom > lastDom && tDom === lastDom
  }
  return false
}

export interface PlannedTask {
  id: string
  title: string
  estimated_hours: string
}

export const defaultApproval = (): TaskApproval => ({
  enabled: false,
  title: '',
  description: '',
  category: 'equipment_purchase',
  custom_category: '',
  amount: '',
  equipment_purpose: '',
  equipment_user: '',
  approvers: [],
  file_url: '',
})
