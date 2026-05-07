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
  is_recurring?: boolean               // 定期タスク
  is_omitted?: boolean                 // 省略
  shared_user_ids?: string[]           // 共有ユーザー (参照のみ)
}

export const TASK_STATUS_OPTIONS = ['未着手', '進行中', '完了', '保留'] as const
export type TaskStatus = typeof TASK_STATUS_OPTIONS[number]

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
