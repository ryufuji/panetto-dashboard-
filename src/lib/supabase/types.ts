// User roles
export type UserRole = 'admin' | 'manager' | 'employee'
export type UserType = 'employee' | 'cast' | 'admin'

// Report status
export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

// Approval status
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

// Approval request status
export type ApprovalRequestStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

// Approval request category
export type ApprovalRequestCategory = 'equipment_purchase' | 'document_review' | 'other'

// Approval request step status
export type ApprovalRequestStepStatus = 'pending' | 'approved' | 'rejected'

// Approval request history action
export type ApprovalRequestHistoryAction = 'created' | 'submitted' | 'approved' | 'rejected' | 'cancelled'

// Priority
export type Priority = 'high' | 'medium' | 'low'

// Store status
export type StoreStatus = 'active' | 'suspended' | 'closed'

// Cast status
export type CastStatus = 'active' | 'inactive' | 'suspended'

// Shift status
export type ShiftStatus = 'scheduled' | 'confirmed' | 'absent' | 'substituted'

// Employment type
export type EmploymentType = 'full_time' | 'part_time' | 'temporary'

// Target scope
export type TargetScope = 'all' | 'department' | 'office' | 'store'

// Access scope
export type AccessScope = 'all' | 'department' | 'office' | 'private'

// Interfaces
export interface Organization {
  id: string
  name: string
  slug: string
  logo_url?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  settings?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  organization_id: string
  name: string
  code: string
  description?: string
  manager_id?: string
  parent_department_id?: string
  order_index: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Office {
  id: string
  organization_id: string
  name: string
  code: string
  address?: string
  phone?: string
  manager_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  organization_id: string
  department_id?: string
  office_id?: string
  email: string
  name: string
  name_kana?: string
  avatar_url?: string
  phone?: string
  employee_number?: string
  user_type: UserType
  role: UserRole
  position?: string
  hire_date?: string
  report_reviewer_id?: string
  is_active: boolean
  last_login_at?: string
  created_at: string
  updated_at: string
  department?: Department
  office?: Office
  report_reviewer?: User
}

export interface Report {
  id: string
  organization_id: string
  user_id: string
  department_id?: string
  report_date: string
  title?: string
  work_hours?: number
  progress_rate?: number
  next_day_plan?: string
  status: ReportStatus
  submitted_at?: string
  template_id?: string
  created_at: string
  updated_at: string
  user?: User
  department?: Department
  tasks?: ReportTask[]
  comments?: ReportComment[]
}

export interface ReportTask {
  id: string
  report_id: string
  parent_task_id?: string
  title: string
  description?: string
  estimated_hours?: number
  actual_hours?: number
  progress_rate: number
  task_type?: string
  priority: Priority
  due_date?: string
  order_index: number
  created_at: string
  updated_at: string
  children?: ReportTask[]
  approval_request?: ApprovalRequest
}

export interface ReportTemplate {
  id: string
  organization_id: string
  created_by: string
  name: string
  description?: string
  template_data: Record<string, unknown>
  is_default: boolean
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface ReportComment {
  id: string
  report_id: string
  user_id: string
  content: string
  is_private: boolean
  created_at: string
  updated_at: string
  user?: User
}

export interface Approval {
  id: string
  organization_id: string
  report_id: string
  assignee_id: string
  requester_id: string
  status: ApprovalStatus
  comment?: string
  requested_at: string
  responded_at?: string
  created_at: string
  updated_at: string
  report?: Report
  assignee?: User
  requester?: User
}

export interface ApprovalHistory {
  id: string
  approval_id: string
  user_id: string
  action: string
  comment?: string
  previous_status?: string
  new_status?: string
  created_at: string
  user?: User
}

export interface Store {
  id: string
  organization_id: string
  office_id?: string
  name: string
  store_code: string
  store_group?: string
  area?: string
  address?: string
  phone?: string
  manager_id?: string
  opening_date?: string
  status: StoreStatus
  created_at: string
  updated_at: string
  manager?: User
  office?: Office
}

export interface Cast {
  id: string
  store_id: string
  name: string
  name_kana?: string
  stage_name?: string
  avatar_url?: string
  phone?: string
  email?: string
  birth_date?: string
  hire_date?: string
  employment_type?: EmploymentType
  status: CastStatus
  notes?: string
  created_at: string
  updated_at: string
}

export interface Handover {
  id: string
  store_id: string
  created_by: string
  title: string
  content: string
  priority: Priority
  category?: string
  is_resolved: boolean
  resolved_by?: string
  resolved_at?: string
  handover_date: string
  created_at: string
  updated_at: string
  creator?: User
}

export interface Sale {
  id: string
  store_id: string
  sales_date: string
  amount: number
  customer_count?: number
  sales_type?: string
  payment_method?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Shift {
  id: string
  store_id: string
  cast_id: string
  shift_date: string
  start_time: string
  end_time: string
  break_minutes: number
  status: ShiftStatus
  notes?: string
  created_at: string
  updated_at: string
  cast?: Cast
}

export interface BoardPost {
  id: string
  organization_id: string
  created_by: string
  title: string
  content: string
  category?: string
  target_scope: TargetScope
  target_id?: string
  is_pinned: boolean
  is_important: boolean
  view_count: number
  created_at: string
  updated_at: string
  creator?: User
}

export interface Todo {
  id: string
  user_id: string
  title: string
  description?: string
  due_date?: string
  priority: Priority
  is_completed: boolean
  completed_at?: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface FileRecord {
  id: string
  organization_id: string
  uploaded_by: string
  file_name: string
  file_path: string
  file_size: number
  file_type?: string
  category?: string
  folder_path?: string
  access_scope: AccessScope
  access_target_id?: string
  description?: string
  tags?: string[]
  download_count: number
  created_at: string
  updated_at: string
  uploader?: User
}

export interface AuditLog {
  id: string
  organization_id: string
  user_id?: string
  action: string
  resource: string
  resource_id?: string
  changes?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
  created_at: string
  user?: User
}

export interface ApprovalRequest {
  id: string
  organization_id: string
  requester_id: string
  title: string
  description?: string
  category: ApprovalRequestCategory
  custom_category?: string
  amount?: number
  report_task_id?: string
  status: ApprovalRequestStatus
  current_step: number
  total_steps: number
  created_at: string
  updated_at: string
  requester?: User
  steps?: ApprovalRequestStep[]
  attachments?: ApprovalRequestAttachment[]
  history?: ApprovalRequestHistoryEntry[]
  report_task?: ReportTask
}

export interface ApprovalRequestStep {
  id: string
  request_id: string
  step_number: number
  approver_id: string
  status: ApprovalRequestStepStatus
  comment?: string
  acted_at?: string
  approver?: User
}

export interface ApprovalRequestAttachment {
  id: string
  request_id: string
  file_name: string
  file_path: string
  file_size: number
  content_type?: string
  uploaded_by: string
  created_at: string
  uploader?: User
}

export interface ApprovalRequestHistoryEntry {
  id: string
  request_id: string
  action: ApprovalRequestHistoryAction
  actor_id: string
  step_number?: number
  comment?: string
  created_at: string
  actor?: User
}

export interface ApprovalThresholdRule {
  id: string
  organization_id: string
  min_amount: number
  max_amount?: number
  required_steps: number
}
