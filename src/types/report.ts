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
