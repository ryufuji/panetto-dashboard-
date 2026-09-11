'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Plus, Trash2, Save, Send, Loader2, X, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { type Task, type TaskApproval, type DeadlineExtension, type PlannedTask, defaultApproval } from '@/types/report'
import { TaskListEditor } from '@/components/reports/TaskListEditor'
import { TaskCarryOverMenu } from '@/components/reports/TaskCarryOverMenu'
import { PlannedTaskCarryOverMenu } from '@/components/reports/PlannedTaskCarryOverMenu'

const EXTENSION_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: '申請中', className: 'bg-orange-50 text-orange-700' },
  approved: { label: '承認済み', className: 'bg-green-50 text-green-700' },
  rejected: { label: '却下', className: 'bg-red-50 text-red-700' },
}

export default function EditReportPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reportDate, setReportDate] = useState('')
  const [title, setTitle] = useState('')
  const [workHours, setWorkHours] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  // 全体進捗率は親タスクの進捗率の平均から自動計算する（手動入力廃止）
  const [nextDayPlan, setNextDayPlan] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [condition, setCondition] = useState('')
  const [summary, setSummary] = useState('')
  const [issues, setIssues] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [originalStatus, setOriginalStatus] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [allMembers, setAllMembers] = useState<any[]>([])
  const [thresholdRules, setThresholdRules] = useState<any[]>([])
  const [defaultApproverId, setDefaultApproverId] = useState<string | null>(null)
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([])
  const [extensionForms, setExtensionForms] = useState<Record<string, { open: boolean; proposed_due_date: string; reason: string; approver_id: string; submitting: boolean }>>({})
  // 子タスクの展開状態
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const toggleExpand = (parentId: string) =>
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })

  useEffect(() => {
    fetchReport()
    loadApprovalData()
  }, [id])

  // 稼働時間の自動計算（開始時間・終了時間から）。新規作成ページと同じ規則
  useEffect(() => {
    if (!startTime || !endTime) return
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    let diffMin = (eh * 60 + em) - (sh * 60 + sm)
    if (diffMin < 0) diffMin += 24 * 60  // 日跨ぎ
    setWorkHours(String(Math.round(diffMin / 60 * 10) / 10))
  }, [startTime, endTime])

  const loadApprovalData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const res = await fetch('/api/organization/users')
    const json = await res.json()
    if (res.ok) {
      setAllMembers(json.data || [])
      setMembers((json.data || []).filter((m: any) => m.id !== user.id))
    }

    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, department_id')
      .eq('id', user.id)
      .single()
    if (profile) {
      const { data: rules } = await supabase
        .from('approval_threshold_rules')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('min_amount', { ascending: true })
      setThresholdRules(rules || [])

      if (profile.department_id) {
        const { data: dept } = await supabase
          .from('departments')
          .select('manager_id')
          .eq('id', profile.department_id)
          .single()
        if (dept?.manager_id && dept.manager_id !== user.id) {
          setDefaultApproverId(dept.manager_id)
        }
      }
    }
  }

  const getRequiredSteps = (amount: string) => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || thresholdRules.length === 0) return 1
    for (const rule of thresholdRules) {
      const minOk = amountNum >= Number(rule.min_amount)
      const maxOk = rule.max_amount == null || amountNum < Number(rule.max_amount)
      if (minOk && maxOk) return rule.required_steps
    }
    return 1
  }

  const fetchReport = async () => {
    try {
      const { data: report, error } = await supabase
        .from('reports')
        .select('*, tasks:report_tasks(*)')
        .eq('id', id)
        .single()

      if (error) throw error
      if (!report) throw new Error('日報が見つかりません')

      setReportDate(report.report_date || '')
      setTitle(report.title || '')
      setWorkHours(report.work_hours?.toString() || '')
      setStartTime(report.start_time ? String(report.start_time).slice(0, 5) : '')
      setEndTime(report.end_time ? String(report.end_time).slice(0, 5) : '')
      setNextDayPlan(report.next_day_plan || '')
      setWorkLocation(report.work_location || '')
      setCondition(report.condition || '')
      setSummary(report.summary || '')
      setIssues(report.issues || '')
      setOriginalStatus(report.status || 'draft')

      // Fetch approval requests linked to tasks
      const reportTasks = report.tasks || []
      const taskIds = reportTasks.map((t: any) => t.id)
      let approvalMap = new Map<string, any>()
      let extensionMap = new Map<string, DeadlineExtension[]>()
      // 共有ユーザー（参照のみ）
      const sharedMap = new Map<string, string[]>()
      if (taskIds.length > 0) {
        const { data: shared } = await supabase
          .from('report_task_shared_users')
          .select('task_id, user_id')
          .in('task_id', taskIds)
        ;(shared || []).forEach((s: any) => {
          const arr = sharedMap.get(s.task_id) || []
          arr.push(s.user_id)
          sharedMap.set(s.task_id, arr)
        })
      }
      if (taskIds.length > 0) {
        const { data: approvalRequests } = await supabase
          .from('approval_requests')
          .select('*')
          .in('report_task_id', taskIds)
        if (approvalRequests) {
          approvalMap = new Map(approvalRequests.map((ar: any) => [ar.report_task_id, ar]))
        }

        // Fetch deadline extension requests for tasks
        const extRes = await fetch(`/api/deadline-extensions?report_id=${id}`)
        const extJson = await extRes.json()
        if (extRes.ok && extJson.data) {
          for (const ext of extJson.data) {
            const key = ext.report_task_id
            if (key) {
              if (!extensionMap.has(key)) extensionMap.set(key, [])
              extensionMap.get(key)!.push(ext)
            }
          }
        }
      }

      // Map existing tasks
      const parentTasks = reportTasks
        .filter((t: any) => !t.parent_task_id)
        .sort((a: any, b: any) => a.order_index - b.order_index)

      const mappedTasks: Task[] = []

      parentTasks.forEach((pt: any) => {
        const localId = crypto.randomUUID()
        const ar = approvalMap.get(pt.id)
        const exts = extensionMap.get(pt.id) || []

        const approval: TaskApproval = ar
          ? {
              enabled: true,
              title: ar.title || '',
              description: ar.description || '',
              category: ar.category || 'equipment_purchase',
              custom_category: ar.custom_category || '',
              amount: ar.amount?.toString() || '',
              equipment_purpose: ar.equipment_purpose || '',
              equipment_user: ar.equipment_user || '',
              approvers: [],
              file_url: ar.file_url || '',
              existing_id: ar.id,
              existing_status: ar.status,
            }
          : defaultApproval()

        // If there's an approved extension, update the displayed due_date
        const approvedExt = exts.find(e => e.status === 'approved')
        const displayDueDate = approvedExt ? approvedExt.proposed_due_date : (pt.due_date || '')

        mappedTasks.push({
          id: localId,
          db_id: pt.id,
          title: pt.title || '',
          description: pt.description || '',
          estimated_hours: pt.estimated_hours?.toString() || '',
          actual_hours: pt.actual_hours?.toString() || '',
          progress_rate: pt.progress_rate || 0,
          task_type: pt.task_type || '',
          priority: pt.priority || 'medium',
          start_date: pt.start_date || '',
          due_date: displayDueDate,
          parent_id: null,
          memo: pt.memo || '',
          purpose: pt.purpose || '',
          task_status: pt.task_status || '',
          actual_url: pt.actual_url || '',
          target_norma_count: pt.target_norma_count != null ? String(pt.target_norma_count) : '',
          target_norma_amount: pt.target_norma_amount != null ? String(pt.target_norma_amount) : '',
          today_result_count: pt.today_result_count != null ? String(pt.today_result_count) : '',
          today_result_amount: pt.today_result_amount != null ? String(pt.today_result_amount) : '',
          no_norma: !!pt.no_norma,
          no_due_date: !!pt.no_due_date,
          is_recurring: !!pt.is_recurring,
          recurrence_pattern: pt.recurrence_pattern || undefined,
          is_omitted: !!pt.is_omitted,
          shared_user_ids: sharedMap.get(pt.id) || [],
          approval,
          deadline_extensions: exts,
        })

        // Child tasks
        const children = reportTasks
          .filter((t: any) => t.parent_task_id === pt.id)
          .sort((a: any, b: any) => a.order_index - b.order_index)

        children.forEach((ct: any) => {
          mappedTasks.push({
            id: crypto.randomUUID(),
            db_id: ct.id,
            title: ct.title || '',
            description: ct.description || '',
            estimated_hours: ct.estimated_hours?.toString() || '',
            actual_hours: ct.actual_hours?.toString() || '',
            progress_rate: ct.progress_rate || 0,
            task_type: ct.task_type || '',
            priority: ct.priority || 'medium',
            start_date: ct.start_date || '',
            due_date: ct.due_date || '',
            parent_id: localId,
            approval: defaultApproval(),
            task_status: ct.task_status || '',
            target_norma_count: ct.target_norma_count != null ? String(ct.target_norma_count) : '',
            target_norma_amount: ct.target_norma_amount != null ? String(ct.target_norma_amount) : '',
            today_result_count: ct.today_result_count != null ? String(ct.today_result_count) : '',
            today_result_amount: ct.today_result_amount != null ? String(ct.today_result_amount) : '',
            no_norma: !!ct.no_norma,
          })
        })
      })

      if (mappedTasks.length === 0) {
        mappedTasks.push({
          id: crypto.randomUUID(),
          title: '',
          description: '',
          estimated_hours: '',
          actual_hours: '',
          progress_rate: 0,
          task_type: '',
          priority: 'medium',
          start_date: new Date().toISOString().split('T')[0],
          due_date: '',
          parent_id: null,
          approval: defaultApproval(),
        })
      }

      setTasks(mappedTasks)

      // Fetch planned tasks
      const { data: existingPlannedTasks } = await supabase
        .from('report_planned_tasks')
        .select('*')
        .eq('report_id', id)
        .order('order_index', { ascending: true })
      if (existingPlannedTasks && existingPlannedTasks.length > 0) {
        setPlannedTasks(existingPlannedTasks.map((pt: any) => ({
          id: pt.id,
          title: pt.title || '',
          estimated_hours: pt.estimated_hours?.toString() || '',
        })))
      }
    } catch (err: any) {
      toast.error(err.message || '日報の取得に失敗しました')
      router.push('/dashboard/reports')
    } finally {
      setLoading(false)
    }
  }

  const addTask = (parentId: string | null = null) => {
    if (parentId) setExpandedParents(prev => new Set(prev).add(parentId))
    setTasks([...tasks, {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      estimated_hours: '',
      actual_hours: '',
      progress_rate: 0,
      task_type: '',
      priority: 'medium',
      start_date: new Date().toISOString().split('T')[0],
      due_date: parentId ? '' : new Date().toISOString().split('T')[0],
      parent_id: parentId,
      approval: defaultApproval(),
      purpose: '',
      memo: '',
      actual_url: '',
      task_status: '未着手',
      target_norma_count: '',
      target_norma_amount: '',
      today_result_count: '',
      today_result_amount: '',
      no_norma: false,
      no_due_date: false,
      is_recurring: false,
      is_omitted: false,
      shared_user_ids: [],
    }])
  }

  const removeTask = (taskId: string) => {
    setTasks(tasks.filter(t => t.id !== taskId && t.parent_id !== taskId))
  }

  const updateTask = (taskId: string, field: string, value: any) => {
    // 同一イベント内で複数項目を続けて更新しても取りこぼさないよう、直前の state から更新する
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t))
  }

  // 親タスクの進捗率の単純平均（親なし時は0）
  const computedProgressRate = (() => {
    const parentTasks = tasks.filter(t => t.parent_id === null && t.title.trim() !== '')
    if (parentTasks.length === 0) return 0
    const sum = parentTasks.reduce((s, t) => s + (Number(t.progress_rate) || 0), 0)
    return Math.round(sum / parentTasks.length)
  })()

  const updateTaskApproval = (taskId: string, field: string, value: any) => {
    setTasks(tasks.map(t => {
      if (t.id !== taskId) return t
      const approval = { ...t.approval, [field]: value }
      if (field === 'enabled' && value && !t.approval.title) {
        approval.title = t.title
      }
      // Auto-add department manager as default approver
      if (field === 'enabled' && value && defaultApproverId && !approval.approvers.includes(defaultApproverId)) {
        approval.approvers = [defaultApproverId, ...approval.approvers]
      }
      return { ...t, approval }
    }))
  }

  const addApproverToTask = (taskId: string, userId: string) => {
    setTasks(tasks.map(t => {
      if (t.id !== taskId) return t
      if (t.approval.approvers.includes(userId)) return t
      return { ...t, approval: { ...t.approval, approvers: [...t.approval.approvers, userId] } }
    }))
  }

  const removeApproverFromTask = (taskId: string, userId: string) => {
    setTasks(tasks.map(t => {
      if (t.id !== taskId) return t
      return { ...t, approval: { ...t.approval, approvers: t.approval.approvers.filter(aid => aid !== userId) } }
    }))
  }

  const isDeadlineLocked = (task: Task) => {
    return !!task.db_id && !!task.due_date
  }

  const toggleExtensionForm = (taskId: string) => {
    setExtensionForms(prev => ({
      ...prev,
      [taskId]: prev[taskId]?.open
        ? { ...prev[taskId], open: false }
        : { open: true, proposed_due_date: '', reason: '', approver_id: defaultApproverId || '', submitting: false },
    }))
  }

  const updateExtensionForm = (taskId: string, field: string, value: string) => {
    setExtensionForms(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value },
    }))
  }

  const submitExtension = async (task: Task) => {
    const form = extensionForms[task.id]
    if (!form || !task.db_id) return

    if (!form.proposed_due_date) {
      toast.error('新しい期限を入力してください')
      return
    }
    if (!form.approver_id) {
      toast.error('承認者を選択してください')
      return
    }
    if (form.proposed_due_date <= task.due_date) {
      toast.error('新しい期限は現在の期限より後の日付にしてください')
      return
    }

    setExtensionForms(prev => ({ ...prev, [task.id]: { ...prev[task.id], submitting: true } }))

    try {
      const res = await fetch('/api/deadline-extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_task_id: task.db_id,
          approver_id: form.approver_id,
          proposed_due_date: form.proposed_due_date,
          reason: form.reason.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success('期限延長申請を送信しました')

      // Add extension to task state
      setTasks(prev => prev.map(t => {
        if (t.id !== task.id) return t
        return {
          ...t,
          deadline_extensions: [...(t.deadline_extensions || []), json.data],
        }
      }))
      setExtensionForms(prev => ({ ...prev, [task.id]: { ...prev[task.id], open: false, submitting: false } }))
    } catch (err: any) {
      toast.error(err.message || '延長申請の送信に失敗しました')
      setExtensionForms(prev => ({ ...prev, [task.id]: { ...prev[task.id], submitting: false } }))
    }
  }

  const handleSubmit = async (status: 'draft' | 'submitted') => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー')

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (status === 'submitted') {
        if (!workHours) {
          toast.error('稼働時間を入力してください')
          setSaving(false)
          return
        }
        if (!tasks.some(t => !t.parent_id && t.title.trim())) {
          toast.error('タスクを1件以上入力してください')
          setSaving(false)
          return
        }
      }

      // Validate approval forms
      const parentTasksWithApproval = tasks.filter(t => !t.parent_id && t.title.trim() && t.approval.enabled && !t.approval.existing_status)
      for (const pt of parentTasksWithApproval) {
        if (!pt.approval.title.trim()) {
          toast.error(`タスク「${pt.title}」の承認申請タイトルを入力してください`)
          setSaving(false)
          return
        }
        if (pt.approval.category === 'other' && !pt.approval.custom_category.trim()) {
          toast.error(`タスク「${pt.title}」のカテゴリ名を入力してください`)
          setSaving(false)
          return
        }
        if (status === 'submitted') {
          const required = getRequiredSteps(pt.approval.amount)
          if (pt.approval.approvers.length < required) {
            toast.error(`タスク「${pt.title}」の承認申請には${required}人以上の承認者が必要です`)
            setSaving(false)
            return
          }
        }
      }

      // Collect existing approval info before task deletion
      const existingApprovals = tasks
        .filter(t => !t.parent_id && t.approval.existing_id)
        .map(t => ({
          localId: t.id,
          approvalId: t.approval.existing_id!,
          approvalStatus: t.approval.existing_status!,
          enabled: t.approval.enabled,
        }))

      // Collect existing deadline extension info before task deletion
      const existingExtensions = tasks
        .filter(t => !t.parent_id && t.deadline_extensions && t.deadline_extensions.length > 0)
        .flatMap(t => t.deadline_extensions!.map(ext => ({
          localId: t.id,
          extensionId: ext.id,
          taskTitle: t.title,
          originalDueDate: ext.original_due_date,
        })))

      // Update report
      // 注意: work_location / condition / summary / issues / tomorrow_plan は
      // reports テーブルに存在しないカラムのため UPDATE 対象に含めない
      // （UI 側の編集状態としてのみ保持。永続化が必要であれば schema 追加要）
      const { error: reportError } = await supabase
        .from('reports')
        .update({
          report_date: reportDate,
          title: title || null,
          work_hours: workHours ? parseFloat(workHours) : null,
          start_time: startTime || null,
          end_time: endTime || null,
          progress_rate: computedProgressRate,
          next_day_plan: nextDayPlan || null,
          status,
          submitted_at: status === 'submitted' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (reportError) throw reportError

      // Delete existing tasks and re-insert
      // ON DELETE SET NULL will detach approval_requests.report_task_id and deadline_extension_requests.report_task_id
      await supabase.from('report_tasks').delete().eq('report_id', id)

      // Insert updated tasks and re-link approvals + extensions
      const parentTasks = tasks.filter(t => !t.parent_id && t.title.trim())
      for (let i = 0; i < parentTasks.length; i++) {
        const pt = parentTasks[i]
        // 子タスクがある親の工数は子の合計（新規作成ページと同じ規則）
        const parentChildren = tasks.filter(t => t.parent_id === pt.id)
        const estimatedHours = parentChildren.length > 0
          ? parentChildren.reduce((sum, c) => sum + (parseFloat(c.estimated_hours) || 0), 0)
          : (pt.estimated_hours ? parseFloat(pt.estimated_hours) : null)
        const { data: savedTask } = await supabase.from('report_tasks').insert({
          report_id: id,
          title: pt.title,
          description: pt.description || null,
          estimated_hours: estimatedHours,
          actual_hours: pt.actual_hours ? parseFloat(pt.actual_hours) : null,
          progress_rate: pt.progress_rate,
          task_type: pt.task_type || null,
          priority: pt.priority,
          start_date: pt.start_date || null,
          due_date: pt.no_due_date ? null : (pt.due_date || null),
          order_index: i,
          memo: pt.memo || null,
          purpose: pt.purpose || null,
          task_status: pt.task_status || null,
          actual_url: pt.actual_url || null,
          target_norma_count: pt.target_norma_count ? parseInt(pt.target_norma_count) : null,
          target_norma_amount: pt.target_norma_amount ? parseFloat(pt.target_norma_amount) : null,
          today_result_count: pt.today_result_count ? parseInt(pt.today_result_count) : null,
          today_result_amount: pt.today_result_amount ? parseFloat(pt.today_result_amount) : null,
          no_norma: !!pt.no_norma,
          no_due_date: !!pt.no_due_date,
          is_recurring: !!pt.is_recurring,
          recurrence_pattern: pt.is_recurring ? (pt.recurrence_pattern || 'daily') : null,
          is_omitted: !!pt.is_omitted,
        }).select().single()

        // 共有ユーザー（参照のみ）を保存
        if (savedTask && pt.shared_user_ids && pt.shared_user_ids.length > 0) {
          await supabase.from('report_task_shared_users').insert(
            pt.shared_user_ids.map((uid: string) => ({ task_id: savedTask.id, user_id: uid }))
          )
        }

        if (savedTask) {
          const existingApproval = existingApprovals.find(ea => ea.localId === pt.id)

          if (existingApproval) {
            if (existingApproval.enabled) {
              // Re-link existing approval to new task
              await supabase
                .from('approval_requests')
                .update({ report_task_id: savedTask.id })
                .eq('id', existingApproval.approvalId)

              // Update draft approval if fields changed
              if (existingApproval.approvalStatus === 'draft') {
                await fetch(`/api/approval-requests/${existingApproval.approvalId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: pt.approval.title.trim(),
                    description: pt.approval.description.trim() || null,
                    category: pt.approval.category,
                    custom_category: pt.approval.category === 'other' ? pt.approval.custom_category.trim() : null,
                    amount: pt.approval.amount ? parseFloat(pt.approval.amount) : null,
                    file_url: pt.approval.file_url.trim() || null,
                    equipment_purpose: pt.approval.category === 'equipment_purchase' ? pt.approval.equipment_purpose.trim() || null : null,
                    equipment_user: pt.approval.category === 'equipment_purchase' ? pt.approval.equipment_user.trim() || null : null,
                  }),
                })

                // Submit draft approval if report is being submitted
                if (status === 'submitted' && pt.approval.approvers.length > 0) {
                  await fetch(`/api/approval-requests/${existingApproval.approvalId}/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ approvers: pt.approval.approvers }),
                  })
                }
              }
            } else if (existingApproval.approvalStatus === 'draft') {
              // Approval was unchecked and is draft - delete it
              await fetch(`/api/approval-requests/${existingApproval.approvalId}`, {
                method: 'DELETE',
              })
            }
          } else if (pt.approval.enabled) {
            // New approval request
            const createRes = await fetch('/api/approval-requests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: pt.approval.title.trim(),
                description: pt.approval.description.trim() || null,
                category: pt.approval.category,
                custom_category: pt.approval.category === 'other' ? pt.approval.custom_category.trim() : null,
                amount: pt.approval.amount ? parseFloat(pt.approval.amount) : null,
                file_url: pt.approval.file_url.trim() || null,
                equipment_purpose: pt.approval.category === 'equipment_purchase' ? pt.approval.equipment_purpose.trim() || null : null,
                equipment_user: pt.approval.category === 'equipment_purchase' ? pt.approval.equipment_user.trim() || null : null,
                report_task_id: savedTask.id,
              }),
            })
            const createJson = await createRes.json()
            if (!createRes.ok) throw new Error(createJson.error)

            if (status === 'submitted' && pt.approval.approvers.length > 0) {
              await fetch(`/api/approval-requests/${createJson.data.id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approvers: pt.approval.approvers }),
              })
            }
          }

          // Re-link deadline extension requests
          const taskExtensions = existingExtensions.filter(ee => ee.localId === pt.id)
          for (const ee of taskExtensions) {
            await fetch('/api/deadline-extensions', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: ee.extensionId, report_task_id: savedTask.id }),
            })
          }
        }

        // Insert child tasks
        const children = tasks.filter(t => t.parent_id === pt.id && t.title.trim())
        for (let j = 0; j < children.length; j++) {
          const ct = children[j]
          await supabase.from('report_tasks').insert({
            report_id: id,
            parent_task_id: savedTask?.id,
            title: ct.title,
            description: ct.description || null,
            estimated_hours: ct.estimated_hours ? parseFloat(ct.estimated_hours) : null,
            actual_hours: ct.actual_hours ? parseFloat(ct.actual_hours) : null,
            progress_rate: ct.progress_rate,
            task_type: ct.task_type || null,
            priority: ct.priority,
            start_date: ct.start_date || null,
            due_date: ct.due_date || null,
            order_index: j,
            task_status: ct.task_status || null,
            target_norma_count: ct.target_norma_count ? parseInt(ct.target_norma_count) : null,
            target_norma_amount: ct.target_norma_amount ? parseFloat(ct.target_norma_amount) : null,
            today_result_count: ct.today_result_count ? parseInt(ct.today_result_count) : null,
            today_result_amount: ct.today_result_amount ? parseFloat(ct.today_result_amount) : null,
            no_norma: !!ct.no_norma,
          })
        }
      }

      // Delete and re-insert planned tasks
      await supabase.from('report_planned_tasks').delete().eq('report_id', id)
      const validPlannedTasks = plannedTasks.filter(pt => pt.title.trim())
      for (let i = 0; i < validPlannedTasks.length; i++) {
        await supabase.from('report_planned_tasks').insert({
          report_id: id,
          title: validPlannedTasks[i].title.trim(),
          estimated_hours: validPlannedTasks[i].estimated_hours ? parseFloat(validPlannedTasks[i].estimated_hours) : null,
          order_index: i,
        })
      }

      // 提出時はLINE Worksにも通知する。提出済みの日報を編集して再提出した場合も
      // 「再提出」として通知する（同じ提出に対する二重送信は notify-submission 側で抑止）
      if (status === 'submitted') {
        try {
          const notifyRes = await fetch(`/api/reports/${id}/notify-submission`, { method: 'POST' })
          const notifyJson = await notifyRes.json().catch(() => ({}))
          if (!notifyRes.ok) {
            console.error('[REPORT_EDIT] notify-submission HTTP error:', notifyRes.status, notifyJson)
            toast.error(`LINE Works通知に失敗: ${notifyJson.error || notifyJson.detail || `HTTP ${notifyRes.status}`}`)
          } else if (notifyJson && notifyJson.success === false) {
            console.error('[REPORT_EDIT] notify-submission send failed:', notifyJson)
            toast.error(`LINE Works通知に失敗: ${notifyJson.error || 'unknown'}`)
          } else {
            console.log('[REPORT_EDIT] notify-submission result:', notifyJson)
          }
        } catch (notifyErr) {
          console.error('[REPORT_EDIT] notify-submission failed:', notifyErr)
          toast.error('LINE Works通知でエラーが発生しました')
        }
      }

      toast.success(status === 'draft' ? '下書きを保存しました' : '日報を提出しました')
      router.push(`/dashboard/reports/${id}`)
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // 編集ページ固有: 提出済みタスクの期限延長申請（TaskListEditor のメタ直後に差し込む）
  const renderDeadlineExtension = (task: Task) => {
    const locked = isDeadlineLocked(task)
    const pendingExt = task.deadline_extensions?.find(e => e.status === 'pending')
    const rejectedExt = task.deadline_extensions?.find(e => e.status === 'rejected')
    const canRequestExtension = locked && !pendingExt
    const extForm = extensionForms[task.id]
    return (
      <>
        {locked && (
          <div className="space-y-2">
            {/* Show pending extension */}
            {pendingExt && (
              <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/30 p-3">
                <CalendarClock className="h-4 w-4 text-orange-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">期限延長申請中</span>
                  <span className="text-muted-foreground ml-2">
                    {pendingExt.original_due_date} → {pendingExt.proposed_due_date}
                  </span>
                </div>
                <Badge className={EXTENSION_STATUS_MAP.pending.className}>{EXTENSION_STATUS_MAP.pending.label}</Badge>
              </div>
            )}

            {/* Show rejected extension */}
            {rejectedExt && !pendingExt && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/30 p-3">
                <CalendarClock className="h-4 w-4 text-red-500 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">期限延長申請が却下されました</span>
                  {rejectedExt.approver_comment && (
                    <p className="text-xs text-muted-foreground mt-1">コメント: {rejectedExt.approver_comment}</p>
                  )}
                </div>
                <Badge className={EXTENSION_STATUS_MAP.rejected.className}>{EXTENSION_STATUS_MAP.rejected.label}</Badge>
              </div>
            )}

            {/* Extension request button & form */}
            {canRequestExtension && (
              <>
                {!extForm?.open ? (
                  <Button variant="outline" size="sm" onClick={() => toggleExtensionForm(task.id)}>
                    <CalendarClock className="mr-1 h-3.5 w-3.5" />期限延長申請
                  </Button>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <CalendarClock className="h-4 w-4 text-amber-600" />
                        期限延長申請
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExtensionForm(task.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">現在の期限</Label>
                        <Input type="date" value={task.due_date} disabled className="bg-gray-50" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">新しい期限 <span className="text-red-500">*</span></Label>
                        <Input
                          type="date"
                          value={extForm.proposed_due_date}
                          min={task.due_date}
                          onChange={e => updateExtensionForm(task.id, 'proposed_due_date', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">理由</Label>
                      <Textarea
                        placeholder="延長が必要な理由..."
                        value={extForm.reason}
                        onChange={e => updateExtensionForm(task.id, 'reason', e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">承認者 <span className="text-red-500">*</span></Label>
                      <Select value={extForm.approver_id} onValueChange={v => updateExtensionForm(task.id, 'approver_id', v)}>
                        <SelectTrigger><SelectValue placeholder="承認者を選択..." /></SelectTrigger>
                        <SelectContent>
                          {members.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}{m.department?.name ? ` (${m.department.name})` : ''}{m.id === defaultApproverId ? ' (部署長)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => submitExtension(task)} disabled={extForm.submitting}>
                        {extForm.submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                        申請
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6 max-w-4xl pb-20">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/reports/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">日報編集</h1>
          <p className="text-muted-foreground">業務内容を編集してください</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>日付</Label>
              <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>タイトル（任意）</Label>
              <Input placeholder="例: A社商談・資料作成" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>開始時間</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                {['09:00', '10:00', '11:00', '12:00', '13:00'].map(t => (
                  <button key={t} type="button" onClick={() => setStartTime(t)}
                    className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>終了時間</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>稼働時間 <span className="text-red-500">(*)</span></Label>
              <Input type="number" step="0.5" placeholder="8.0" value={workHours} onChange={e => setWorkHours(e.target.value)} />
              <p className="text-xs text-muted-foreground">開始・終了時間を入れると自動計算されます</p>
            </div>
            <div className="space-y-2">
              <Label>全体進捗率（%）</Label>
              <div className="flex items-center gap-3 h-9 px-3 rounded-md border bg-muted/30">
                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      computedProgressRate >= 80 ? 'bg-green-500' : computedProgressRate >= 50 ? 'bg-yellow-500' : 'bg-blue-400'
                    }`}
                    style={{ width: `${computedProgressRate}%` }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums min-w-[3rem] text-right">{computedProgressRate}%</span>
              </div>
              <p className="text-xs text-muted-foreground">親タスクの進捗率の平均から自動計算</p>
            </div>
            <div className="space-y-2">
              <Label>勤務場所</Label>
              <Select value={workLocation} onValueChange={setWorkLocation}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">オフィス</SelectItem>
                  <SelectItem value="remote">リモート</SelectItem>
                  <SelectItem value="client">客先</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>体調</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="good">良好</SelectItem>
                <SelectItem value="normal">普通</SelectItem>
                <SelectItem value="poor">不調</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>タスク一覧</CardTitle>
          <div className="flex gap-2">
            <TaskCarryOverMenu tasks={tasks} setTasks={setTasks} />
            <Button variant="outline" size="sm" onClick={() => addTask(null)}>
              <Plus className="mr-1 h-4 w-4" />親タスク追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <TaskListEditor
            tasks={tasks}
            today={today}
            members={members}
            defaultApproverId={defaultApproverId}
            getRequiredSteps={getRequiredSteps}
            updateTask={updateTask}
            updateTaskApproval={updateTaskApproval}
            addTask={addTask}
            removeTask={removeTask}
            addApproverToTask={addApproverToTask}
            removeApproverFromTask={removeApproverFromTask}
            expandedParents={expandedParents}
            toggleExpand={toggleExpand}
            isDueDateLocked={isDeadlineLocked}
            renderAfterMeta={renderDeadlineExtension}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>業務サマリー</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>本日の成果・概要</Label>
            <Textarea placeholder="本日の業務の概要を入力..." value={summary} onChange={e => setSummary(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>課題・問題点</Label>
            <Textarea placeholder="現在の課題や問題点があれば入力..." value={issues} onChange={e => setIssues(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>翌日の予定</Label>
            <div className="space-y-2 ml-1">
              {plannedTasks.map((pt) => (
                <div key={pt.id} className="flex items-center gap-2">
                  <Input
                    placeholder="タスク名"
                    value={pt.title}
                    onChange={e => setPlannedTasks(prev => prev.map(t => t.id === pt.id ? { ...t, title: e.target.value } : t))}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="0"
                      value={pt.estimated_hours}
                      onChange={e => setPlannedTasks(prev => prev.map(t => t.id === pt.id ? { ...t, estimated_hours: e.target.value } : t))}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-500 shrink-0 h-8 w-8 p-0" onClick={() => setPlannedTasks(prev => prev.filter(t => t.id !== pt.id))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPlannedTasks(prev => [...prev, { id: crypto.randomUUID(), title: '', estimated_hours: '' }])}
                >
                  <Plus className="mr-1 h-4 w-4" />タスク追加
                </Button>
                <PlannedTaskCarryOverMenu plannedTasks={plannedTasks} setPlannedTasks={setPlannedTasks} />
              </div>
            </div>
            <Label className="text-sm text-muted-foreground">メモ（任意）</Label>
            <Textarea placeholder="翌日の予定を入力..." value={nextDayPlan} onChange={e => setNextDayPlan(e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/dashboard/reports/${id}`}>
          <Button variant="ghost">キャンセル</Button>
        </Link>
        <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          下書き保存
        </Button>
        <Button onClick={() => handleSubmit('submitted')} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          提出
        </Button>
      </div>
    </div>
  )
}
