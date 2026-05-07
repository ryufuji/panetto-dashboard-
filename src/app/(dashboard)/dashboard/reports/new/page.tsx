'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Save, Send, GripVertical, X, ClipboardCheck, Link2, ChevronDown, ChevronRight, Clock, Repeat, ArrowRight, ArrowLeft, Download, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { type Task, type TaskApproval, type PlannedTask, defaultApproval, TASK_STATUS_OPTIONS } from '@/types/report'
import { TaskCarryOverMenu } from '@/components/reports/TaskCarryOverMenu'
import { PlannedTaskCarryOverMenu } from '@/components/reports/PlannedTaskCarryOverMenu'

const APPROVAL_CATEGORIES = [
  { value: 'equipment_purchase', label: '備品購入' },
  { value: 'document_review', label: '書類チェック' },
  { value: 'other', label: 'その他' },
]

export default function NewReportPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [title, setTitle] = useState('')
  const [workHours, setWorkHours] = useState('')
  // 全体進捗率は親タスクの進捗率の平均から自動計算する（手動入力廃止）
  const [nextDayPlan, setNextDayPlan] = useState('')
  const today = new Date().toISOString().split('T')[0]

  // ───── タブ切替 ──────
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow'>('today')

  // ───── 基本情報 ──────
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [areaId, setAreaId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [userName, setUserName] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const setNow = (setter: (v: string) => void) => {
    const d = new Date()
    setter(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }
  const [draftLoading, setDraftLoading] = useState(false)

  // 提出履歴 / 期日遅れタスク（翌日タブで表示）
  const [submittedHistory, setSubmittedHistory] = useState<Array<{ id: string; report_date: string; title: string | null; status: string }>>([])
  const [overdueTasks, setOverdueTasks] = useState<Array<{ id: string; title: string; due_date: string; report_date: string; report_id: string; progress_rate: number; task_status: string | null }>>([])
  const [overdueFilter, setOverdueFilter] = useState<'all' | 'incomplete' | 'in_progress'>('incomplete')

  // 翌日タブを開いたタイミングで遅延読み込み
  useEffect(() => {
    if (activeTab !== 'tomorrow') return
    let cancelled = false
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // 提出履歴 (直近10件)
      const { data: hist } = await supabase
        .from('reports')
        .select('id, report_date, title, status')
        .eq('user_id', user.id)
        .in('status', ['submitted', 'approved'])
        .order('report_date', { ascending: false })
        .limit(10)
      if (!cancelled) setSubmittedHistory((hist || []) as any)

      // 期日遅れタスク（自分のレポート、due_date < today、進捗 < 100）
      const { data: myReports } = await supabase
        .from('reports')
        .select('id, report_date')
        .eq('user_id', user.id)
        .in('status', ['submitted', 'approved'])
      const reportIds = (myReports || []).map((r: any) => r.id)
      if (reportIds.length === 0) {
        if (!cancelled) setOverdueTasks([])
        return
      }
      const dateMap = new Map((myReports || []).map((r: any) => [r.id, r.report_date]))
      const { data: od } = await supabase
        .from('report_tasks')
        .select('id, title, due_date, progress_rate, task_status, report_id')
        .in('report_id', reportIds)
        .lt('due_date', today)
        .lt('progress_rate', 100)
        .order('due_date', { ascending: true })
        .limit(50)
      if (!cancelled) {
        const enriched = (od || []).map((t: any) => ({
          ...t,
          report_date: dateMap.get(t.report_id) || '',
        }))
        setOverdueTasks(enriched as any)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // 下書きデータを取得 — 自分の最新の draft レポートを読み込んで現在の入力に反映
  const loadLatestDraft = async () => {
    setDraftLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー')

      const { data: drafts, error: draftsError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(1)
      if (draftsError) throw draftsError
      const draft = (drafts || [])[0]
      if (!draft) {
        toast.info('下書きが見つかりませんでした')
        return
      }

      // ① reports 本体
      setReportDate(draft.report_date || today)
      setTitle(draft.title || '')
      setWorkHours(draft.work_hours != null ? String(draft.work_hours) : '')
      setNextDayPlan(draft.next_day_plan || '')
      setStartTime(draft.start_time || '')
      setEndTime(draft.end_time || '')
      if (draft.department_id) setDepartmentId(draft.department_id)

      // ② report_tasks (親+子)
      const { data: dbTasks, error: tasksErr } = await supabase
        .from('report_tasks')
        .select('*')
        .eq('report_id', draft.id)
        .order('order_index', { ascending: true })
      if (tasksErr) throw tasksErr

      // 共有ユーザー
      const taskIds = (dbTasks || []).map((t: any) => t.id)
      let sharedMap = new Map<string, string[]>()
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

      const dbToLocal = new Map<string, string>()
      const restored: Task[] = (dbTasks || []).map((t: any) => {
        const localId = crypto.randomUUID()
        dbToLocal.set(t.id, localId)
        return {
          id: localId,
          db_id: t.id,
          title: t.title || '',
          description: t.description || '',
          estimated_hours: t.estimated_hours != null ? String(t.estimated_hours) : '',
          actual_hours: t.actual_hours != null ? String(t.actual_hours) : '',
          progress_rate: t.progress_rate ?? 0,
          task_type: t.task_type || '',
          priority: t.priority || 'medium',
          start_date: t.start_date || today,
          due_date: t.due_date || '',
          parent_id: t.parent_task_id ? dbToLocal.get(t.parent_task_id) || null : null,
          approval: defaultApproval(),
          purpose: t.purpose || '',
          memo: t.memo || '',
          actual_url: t.actual_url || '',
          task_status: t.task_status || '未着手',
          target_norma_count: t.target_norma_count != null ? String(t.target_norma_count) : '',
          target_norma_amount: t.target_norma_amount != null ? String(t.target_norma_amount) : '',
          today_result_count: t.today_result_count != null ? String(t.today_result_count) : '',
          today_result_amount: t.today_result_amount != null ? String(t.today_result_amount) : '',
          no_norma: !!t.no_norma,
          no_due_date: !!t.no_due_date,
          is_recurring: !!t.is_recurring,
          is_omitted: !!t.is_omitted,
          shared_user_ids: sharedMap.get(t.id) || [],
        } as Task
      })
      if (restored.length > 0) setTasks(restored)

      // ③ planned_tasks
      const { data: dbPlanned } = await supabase
        .from('report_planned_tasks')
        .select('*')
        .eq('report_id', draft.id)
        .order('order_index', { ascending: true })
      const restoredPlanned: PlannedTask[] = (dbPlanned || []).map((p: any) => ({
        id: crypto.randomUUID(),
        title: p.title || '',
        estimated_hours: p.estimated_hours != null ? String(p.estimated_hours) : '',
      }))
      setPlannedTasks(restoredPlanned)

      toast.success(`${draft.report_date} の下書きを読み込みました`)
    } catch (err: any) {
      toast.error(err.message || '下書きの取得に失敗しました')
    } finally {
      setDraftLoading(false)
    }
  }

  // ページ1（本日タブ）の未完了タスクを 翌日以降の予定 に追加
  const addCurrentIncompleteToPlanned = () => {
    const incomplete = tasks.filter(t =>
      !t.parent_id &&
      t.title.trim() &&
      (t.progress_rate < 100) &&
      (t.task_status !== '完了')
    )
    if (incomplete.length === 0) {
      toast.info('未完了の親タスクはありません')
      return
    }
    const existing = new Set(plannedTasks.map(p => p.title.trim().toLowerCase()).filter(Boolean))
    const additions: PlannedTask[] = []
    let skipped = 0
    for (const t of incomplete) {
      const norm = t.title.trim().toLowerCase()
      if (existing.has(norm)) { skipped++; continue }
      existing.add(norm)
      additions.push({
        id: crypto.randomUUID(),
        title: t.title.trim(),
        estimated_hours: t.estimated_hours || '',
      })
    }
    if (additions.length === 0) {
      toast.info('全て既に追加済みです')
      return
    }
    setPlannedTasks(prev => [...prev.filter(p => p.title.trim() !== ''), ...additions])
    let msg = `${additions.length}件のタスクを追加しました`
    if (skipped > 0) msg += `（${skipped}件は重複のためスキップ）`
    toast.success(msg)
  }

  // 過去の未完了タスクを全て追加（既存APIの incomplete_all モード）
  const addAllPastIncompleteToPlanned = async () => {
    try {
      const res = await fetch('/api/reports/carry-over-tasks?mode=incomplete_all')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const data: any[] = json.data || []
      if (data.length === 0) {
        toast.info('引き継ぎ可能なタスクがありません')
        return
      }
      const existing = new Set(plannedTasks.map(p => p.title.trim().toLowerCase()).filter(Boolean))
      const additions: PlannedTask[] = []
      let skipped = 0
      for (const t of data) {
        const norm = (t.title || '').trim().toLowerCase()
        if (!norm || existing.has(norm)) { if (norm) skipped++; continue }
        existing.add(norm)
        additions.push({
          id: crypto.randomUUID(),
          title: t.title,
          estimated_hours: t.estimated_hours != null ? String(t.estimated_hours) : '',
        })
      }
      if (additions.length === 0) {
        toast.info('全て既に追加済みです')
        return
      }
      setPlannedTasks(prev => [...prev.filter(p => p.title.trim() !== ''), ...additions])
      let msg = `${additions.length}件のタスクを追加しました`
      if (skipped > 0) msg += `（${skipped}件は重複のためスキップ）`
      toast.success(msg)
    } catch (err: any) {
      toast.error(err.message || '取得に失敗しました')
    }
  }

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      estimated_hours: '',
      actual_hours: '',
      progress_rate: 0,
      task_type: '',
      priority: 'medium',
      start_date: today,
      due_date: today,
      parent_id: null,
      approval: defaultApproval(),
      // v2 新フィールド初期値
      task_status: '未着手',
      purpose: '',
      memo: '',
      actual_url: '',
      target_norma_count: '',
      target_norma_amount: '',
      today_result_count: '',
      today_result_amount: '',
      no_norma: false,
      no_due_date: false,
      is_recurring: false,
      is_omitted: false,
      shared_user_ids: [],
    },
  ])
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([])
  // 子課題の展開状態（開いている親タスクのIDを保持）
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const toggleExpand = (parentId: string) =>
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  const [members, setMembers] = useState<any[]>([])
  const [thresholdRules, setThresholdRules] = useState<any[]>([])
  const [defaultApproverId, setDefaultApproverId] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load organization members
      const res = await fetch('/api/organization/users')
      const json = await res.json()
      if (res.ok) {
        setMembers((json.data || []).filter((m: any) => m.id !== user.id))
      }

      // Load profile + threshold rules + offices + departments
      const { data: profile } = await supabase
        .from('users')
        .select('id, name, organization_id, department_id, office_id')
        .eq('id', user.id)
        .single()
      if (profile) {
        // 名前 / 拠点 / 部署 を初期値にセット
        setUserName((profile as any).name || '')
        if ((profile as any).office_id) setAreaId((profile as any).office_id)
        if ((profile as any).department_id) setDepartmentId((profile as any).department_id)

        // 拠点と部署の選択肢
        const [{ data: offs }, { data: depts }] = await Promise.all([
          supabase.from('offices').select('id, name').eq('organization_id', (profile as any).organization_id).eq('is_active', true).order('name'),
          supabase.from('departments').select('id, name').eq('organization_id', (profile as any).organization_id).eq('is_active', true).order('order_index'),
        ])
        setAreas((offs || []) as any)
        setDepartments((depts || []) as any)

        // 承認閾値ルール
        const { data: rules } = await supabase
          .from('approval_threshold_rules')
          .select('*')
          .eq('organization_id', (profile as any).organization_id)
          .order('min_amount', { ascending: true })
        setThresholdRules(rules || [])

        if ((profile as any).department_id) {
          const { data: dept } = await supabase
            .from('departments')
            .select('manager_id')
            .eq('id', (profile as any).department_id)
            .single()
          if ((dept as any)?.manager_id && (dept as any).manager_id !== user.id) {
            setDefaultApproverId((dept as any).manager_id)
          }
        }
      }
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const addTask = (parentId: string | null = null) => {
    // 子タスクを追加した時は親を自動的に展開する
    if (parentId) {
      setExpandedParents(prev => new Set(prev).add(parentId))
    }
    setTasks([...tasks, {
      id: crypto.randomUUID(), title: '', description: '', estimated_hours: '', actual_hours: '',
      progress_rate: 0, task_type: '', priority: 'medium', start_date: today, due_date: today,
      task_status: '未着手', purpose: '', memo: '', actual_url: '',
      target_norma_count: '', target_norma_amount: '', today_result_count: '', today_result_amount: '',
      no_norma: false, no_due_date: false, is_recurring: false, is_omitted: false, shared_user_ids: [],
      parent_id: parentId, approval: defaultApproval()
    }])
  }

  const removeTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id && t.parent_id !== id))
  }

  const updateTask = (id: string, field: string, value: any) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t))
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
      // Auto-fill title from task name when enabling
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
      return { ...t, approval: { ...t.approval, approvers: t.approval.approvers.filter(id => id !== userId) } }
    }))
  }

  const handleSubmit = async (status: 'draft' | 'submitted') => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー')

      const { data: profile } = await supabase.from('users').select('organization_id, department_id').eq('id', user.id).single()
      if (!profile) throw new Error('プロフィール未設定')

      // Validate approval forms
      const parentTasksWithApproval = tasks.filter(t => !t.parent_id && t.title && t.approval.enabled)
      for (const pt of parentTasksWithApproval) {
        if (!pt.approval.title.trim()) {
          toast.error(`タスク「${pt.title}」の承認申請タイトルを入力してください`)
          setLoading(false)
          return
        }
        if (pt.approval.category === 'other' && !pt.approval.custom_category.trim()) {
          toast.error(`タスク「${pt.title}」のカテゴリ名を入力してください`)
          setLoading(false)
          return
        }
        if (status === 'submitted') {
          const required = getRequiredSteps(pt.approval.amount)
          if (pt.approval.approvers.length < required) {
            toast.error(`タスク「${pt.title}」の承認申請には${required}人以上の承認者が必要です`)
            setLoading(false)
            return
          }
        }
      }

      const { data: report, error } = await supabase.from('reports').insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        department_id: departmentId || profile.department_id,
        report_date: reportDate,
        title: title || null,
        work_hours: workHours ? parseFloat(workHours) : null,
        progress_rate: computedProgressRate,
        next_day_plan: nextDayPlan || null,
        status,
        start_time: startTime || null,
        end_time: endTime || null,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      }).select().single()

      if (error) throw error

      // Insert tasks
      const parentTasks = tasks.filter(t => !t.parent_id && t.title)
      for (let i = 0; i < parentTasks.length; i++) {
        const pt = parentTasks[i]
        const { data: savedTask } = await supabase.from('report_tasks').insert({
          report_id: report.id,
          title: pt.title,
          description: pt.description || null,
          estimated_hours: pt.estimated_hours ? parseFloat(pt.estimated_hours) : null,
          actual_hours: pt.actual_hours ? parseFloat(pt.actual_hours) : null,
          progress_rate: pt.progress_rate,
          task_type: pt.task_type || null,
          priority: pt.priority,
          start_date: pt.start_date || null,
          due_date: pt.no_due_date ? null : (pt.due_date || null),
          order_index: i,
          // v2 拡張
          purpose: pt.purpose || null,
          memo: pt.memo || null,
          actual_url: pt.actual_url || null,
          task_status: pt.task_status || null,
          target_norma_count: pt.target_norma_count ? parseInt(pt.target_norma_count) : null,
          target_norma_amount: pt.target_norma_amount ? parseFloat(pt.target_norma_amount) : null,
          today_result_count: pt.today_result_count ? parseInt(pt.today_result_count) : null,
          today_result_amount: pt.today_result_amount ? parseFloat(pt.today_result_amount) : null,
          no_norma: !!pt.no_norma,
          no_due_date: !!pt.no_due_date,
          is_recurring: !!pt.is_recurring,
          is_omitted: !!pt.is_omitted,
        }).select().single()

        // 共有ユーザー (参照のみ) を保存
        if (savedTask && pt.shared_user_ids && pt.shared_user_ids.length > 0) {
          await supabase.from('report_task_shared_users').insert(
            pt.shared_user_ids.map((uid: string) => ({ task_id: savedTask.id, user_id: uid }))
          )
        }

        // Create approval request if enabled
        if (pt.approval.enabled && savedTask) {
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
              report_task_id: savedTask.id,
            }),
          })
          const createJson = await createRes.json()
          if (!createRes.ok) throw new Error(createJson.error)

          // Submit approval if report is being submitted
          if (status === 'submitted' && pt.approval.approvers.length > 0) {
            const submitRes = await fetch(`/api/approval-requests/${createJson.data.id}/submit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approvers: pt.approval.approvers }),
            })
            const submitJson = await submitRes.json()
            if (!submitRes.ok) throw new Error(submitJson.error)
          }
        }

        // Insert child tasks
        const children = tasks.filter(t => t.parent_id === pt.id && t.title)
        for (let j = 0; j < children.length; j++) {
          const ct = children[j]
          await supabase.from('report_tasks').insert({
            report_id: report.id,
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
          })
        }
      }

      // Insert planned tasks
      const validPlannedTasks = plannedTasks.filter(pt => pt.title.trim())
      for (let i = 0; i < validPlannedTasks.length; i++) {
        await supabase.from('report_planned_tasks').insert({
          report_id: report.id,
          title: validPlannedTasks[i].title.trim(),
          estimated_hours: validPlannedTasks[i].estimated_hours ? parseFloat(validPlannedTasks[i].estimated_hours) : null,
          order_index: i,
        })
      }

      // 提出時はLINE Worksにも通知（失敗しても保存は成功扱い）
      if (status === 'submitted') {
        try {
          await fetch(`/api/reports/${report.id}/notify-submission`, { method: 'POST' })
        } catch (notifyErr) {
          console.error('[REPORT_NEW] notify-submission failed:', notifyErr)
        }
      }

      toast.success(status === 'draft' ? '下書きを保存しました' : '日報を提出しました')
      router.push('/dashboard/reports')
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const parentTasks = tasks.filter(t => !t.parent_id)

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">日報作成</h1>
          <p className="text-muted-foreground">業務内容を記録してください</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadLatestDraft} disabled={draftLoading}>
          <Download className="mr-1 h-4 w-4" />
          {draftLoading ? '取得中...' : '下書きデータを取得'}
        </Button>
      </div>

      {/* タブ切替 */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${activeTab === 'today' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >① 本日の業務</button>
        <button
          type="button"
          onClick={() => setActiveTab('tomorrow')}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${activeTab === 'tomorrow' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >② 翌日以降の予定</button>
      </div>

      {activeTab === 'today' && (
      <>
      <Card>
        <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>エリア <span className="text-red-500">(*)</span></Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>部署 <span className="text-red-500">(*)</span></Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>氏名 <span className="text-red-500">(*)</span></Label>
              <Input value={userName} disabled />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>日付 <span className="text-red-500">(*)</span></Label>
              <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>タイトル（任意）</Label>
              <Input placeholder="例: A社商談・資料作成" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>開始 <span className="text-red-500">(*)</span></Label>
              <Input type="time" placeholder="12:30" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>終了 <span className="text-red-500">(*)</span></Label>
              <div className="flex items-center gap-2">
                <Input type="time" placeholder="12:30" value={endTime} onChange={e => setEndTime(e.target.value)} className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={() => setNow(setEndTime)}>
                  <Clock className="mr-1 h-3 w-3" />現在の時間を入力
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>稼働時間 (h)</Label>
              <Input type="number" step="0.5" placeholder="8.0" value={workHours} onChange={e => setWorkHours(e.target.value)} />
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
          {parentTasks.map((task, i) => {
            const children = tasks.filter(t => t.parent_id === task.id)
            const requiredSteps = getRequiredSteps(task.approval.amount)
            return (
              <div key={task.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-muted-foreground">親課題 {i + 1}</span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => addTask(task.id)}><Plus className="h-3 w-3 mr-1" />子課題</Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
                <Input placeholder="タスク名" value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} />
                <Textarea placeholder="詳細（任意）" value={task.description} onChange={e => updateTask(task.id, 'description', e.target.value)} rows={2} />
                {/* タスクメタ: 期日 / 進捗 / ステータス / 工数 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">期日 <span className="text-red-500">(*)</span></Label>
                      <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => updateTask(task.id, 'due_date', today)}>本日</Button>
                    </div>
                    <Input type="date" value={task.due_date} onChange={e => updateTask(task.id, 'due_date', e.target.value)} disabled={!!task.no_due_date} />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <input type="checkbox" checked={!!task.no_due_date} onChange={e => updateTask(task.id, 'no_due_date', e.target.checked)} />期日なし
                    </label>
                  </div>
                  <div>
                    <Label className="text-xs">進捗(%) <span className="text-red-500">(*)</span></Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={task.progress_rate || ''} onChange={e => updateTask(task.id, 'progress_rate', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs">ステータス <span className="text-red-500">(*)</span></Label>
                    <Select value={task.task_status || ''} onValueChange={v => updateTask(task.id, 'task_status', v)}>
                      <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">工数(h) <span className="text-red-500">(*)</span></Label>
                    <Input type="number" step="0.5" placeholder="0.5" value={task.estimated_hours} onChange={e => updateTask(task.id, 'estimated_hours', e.target.value)} />
                  </div>
                </div>

                {/* 目的 */}
                <div className="space-y-1">
                  <Label className="text-xs">目的</Label>
                  <Textarea placeholder="この課題の目的・背景" value={task.purpose || ''} onChange={e => updateTask(task.id, 'purpose', e.target.value)} rows={2} />
                </div>

                {/* 省略 / 定期タスク フラグ */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={!!task.is_omitted} onChange={e => updateTask(task.id, 'is_omitted', e.target.checked)} />
                    省略
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={!!task.is_recurring} onChange={e => updateTask(task.id, 'is_recurring', e.target.checked)} />
                    <Repeat className="h-3 w-3 inline" />定期タスク
                  </label>
                </div>

                {/* 備考・メモ */}
                <div className="space-y-1">
                  <Label className="text-xs">備考・メモ (任意)</Label>
                  <Textarea placeholder="備考やメモを入力" value={task.memo || ''} onChange={e => updateTask(task.id, 'memo', e.target.value)} rows={2} />
                </div>

                {/* 進行中・実績URL */}
                <div className="space-y-1">
                  <Label className="text-xs">進行中・実績URL (任意)</Label>
                  <Input type="url" placeholder="https://..." value={task.actual_url || ''} onChange={e => updateTask(task.id, 'actual_url', e.target.value)} />
                </div>

                {/* 共有するユーザー (参照のみ) */}
                <div className="space-y-1">
                  <Label className="text-xs">共有するユーザー (任意)</Label>
                  <div className="flex flex-wrap gap-1">
                    {(task.shared_user_ids || []).map(uid => {
                      const m = members.find((mm: any) => mm.id === uid)
                      return (
                        <span key={uid} className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 text-xs px-2 py-0.5 border border-blue-200">
                          {m?.name || uid}
                          <button type="button" onClick={() => updateTask(task.id, 'shared_user_ids', (task.shared_user_ids || []).filter(x => x !== uid))} className="hover:text-blue-900">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )
                    })}
                    <Select value="" onValueChange={(v) => {
                      if (!v) return
                      const cur = task.shared_user_ids || []
                      if (!cur.includes(v)) updateTask(task.id, 'shared_user_ids', [...cur, v])
                    }}>
                      <SelectTrigger className="h-7 text-xs w-auto"><SelectValue placeholder="+ ユーザーを追加" /></SelectTrigger>
                      <SelectContent>
                        {members.filter((m: any) => !(task.shared_user_ids || []).includes(m.id)).map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ノルマ目標 / 今日の成果 */}
                {!task.no_norma && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div><Label className="text-xs">ノルマ(目標) 件数</Label><Input type="number" placeholder="例: 500" value={task.target_norma_count || ''} onChange={e => updateTask(task.id, 'target_norma_count', e.target.value)} /></div>
                    <div><Label className="text-xs">ノルマ(目標) 金額</Label><Input type="number" placeholder="例: 500000" value={task.target_norma_amount || ''} onChange={e => updateTask(task.id, 'target_norma_amount', e.target.value)} /></div>
                    <div><Label className="text-xs">今日の成果 件数</Label><Input type="number" placeholder="例: 250" value={task.today_result_count || ''} onChange={e => updateTask(task.id, 'today_result_count', e.target.value)} /></div>
                    <div><Label className="text-xs">今日の成果 金額</Label><Input type="number" placeholder="例: 250000" value={task.today_result_amount || ''} onChange={e => updateTask(task.id, 'today_result_amount', e.target.value)} /></div>
                  </div>
                )}
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!task.no_norma} onChange={e => updateTask(task.id, 'no_norma', e.target.checked)} />ノルマなし
                </label>

                {/* 既存の見積/実績/優先度/開始日（参照UI互換のため省略可表示） */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">追加項目（実績h / 優先度 / 開始日）</summary>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                    <div><Label className="text-xs">実績(h)</Label><Input type="number" step="0.5" value={task.actual_hours} onChange={e => updateTask(task.id, 'actual_hours', e.target.value)} /></div>
                    <div><Label className="text-xs">優先度</Label>
                      <Select value={task.priority} onValueChange={v => updateTask(task.id, 'priority', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">高</SelectItem>
                          <SelectItem value="medium">中</SelectItem>
                          <SelectItem value="low">低</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">開始日</Label><Input type="date" value={task.start_date} onChange={e => updateTask(task.id, 'start_date', e.target.value)} /></div>
                  </div>
                </details>

                {/* 子課題は展開式 */}
                {children.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => toggleExpand(task.id)}
                  >
                    {expandedParents.has(task.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    子課題 {children.length}件{expandedParents.has(task.id) ? 'を非表示' : 'を表示'}
                  </Button>
                )}
                {expandedParents.has(task.id) && children.map((child, j) => (
                  <div key={child.id} className="ml-6 rounded-lg border border-dashed p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">子課題 {j + 1}</span>
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" className="text-red-500 h-6" onClick={() => removeTask(child.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                    <Input placeholder="タスク名" value={child.title} onChange={e => updateTask(child.id, 'title', e.target.value)} />
                    <Textarea placeholder="詳細（任意）" value={child.description} onChange={e => updateTask(child.id, 'description', e.target.value)} rows={2} />
                    <div className="grid grid-cols-5 gap-2">
                      <div><Label className="text-xs">見積(h)</Label><Input type="number" step="0.5" value={child.estimated_hours} onChange={e => updateTask(child.id, 'estimated_hours', e.target.value)} /></div>
                      <div><Label className="text-xs">実績(h)</Label><Input type="number" step="0.5" value={child.actual_hours} onChange={e => updateTask(child.id, 'actual_hours', e.target.value)} /></div>
                      <div><Label className="text-xs">進捗(%)</Label><Input type="number" min="0" max="100" placeholder="0" value={child.progress_rate || ''} onChange={e => updateTask(child.id, 'progress_rate', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)} /></div>
                      <div><Label className="text-xs">開始日</Label><Input type="date" value={child.start_date} onChange={e => updateTask(child.id, 'start_date', e.target.value)} /></div>
                      <div><Label className="text-xs">期限</Label><Input type="date" value={child.due_date} onChange={e => updateTask(child.id, 'due_date', e.target.value)} /></div>
                    </div>
                  </div>
                ))}

                {/* Approval request section */}
                <div className="mt-2 border-t pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.approval.enabled}
                      onChange={e => updateTaskApproval(task.id, 'enabled', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <ClipboardCheck className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">承認申請を行う</span>
                  </label>

                  {task.approval.enabled && (
                    <div className="mt-3 ml-6 space-y-3 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs">申請タイトル <span className="text-red-500">*</span></Label>
                        <Input
                          placeholder="申請タイトル"
                          value={task.approval.title}
                          onChange={e => updateTaskApproval(task.id, 'title', e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">カテゴリ</Label>
                        <Select value={task.approval.category} onValueChange={v => updateTaskApproval(task.id, 'category', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {APPROVAL_CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {task.approval.category === 'other' && (
                        <div className="space-y-2">
                          <Label className="text-xs">カテゴリ名 <span className="text-red-500">*</span></Label>
                          <Input
                            placeholder="カテゴリ名を入力"
                            value={task.approval.custom_category}
                            onChange={e => updateTaskApproval(task.id, 'custom_category', e.target.value)}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label className="text-xs">金額</Label>
                        <Input
                          type="number"
                          placeholder="金額（円）"
                          value={task.approval.amount}
                          onChange={e => updateTaskApproval(task.id, 'amount', e.target.value)}
                        />
                        {task.approval.amount && (
                          <p className="text-xs text-muted-foreground">
                            この金額には{requiredSteps}段階の承認が必要です
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">説明（任意）</Label>
                        <Textarea
                          placeholder="申請の詳細を入力"
                          value={task.approval.description}
                          onChange={e => updateTaskApproval(task.id, 'description', e.target.value)}
                          rows={2}
                        />
                      </div>

                      {/* Approvers */}
                      <div className="space-y-2">
                        <Label className="text-xs">承認者</Label>
                        {task.approval.approvers.length > 0 && (
                          <div className="space-y-1">
                            {task.approval.approvers.map((uid, index) => {
                              const member = members.find(m => m.id === uid)
                              return (
                                <div key={uid} className="flex items-center gap-2 rounded border bg-white p-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                                    {index + 1}
                                  </span>
                                  <span className="flex-1 text-sm">{member?.name || '不明'}{uid === defaultApproverId && <span className="text-xs text-blue-600 ml-1">(部署長)</span>}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => removeApproverFromTask(task.id, uid)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <Select value="" onValueChange={v => addApproverToTask(task.id, v)}>
                          <SelectTrigger><SelectValue placeholder="承認者を追加..." /></SelectTrigger>
                          <SelectContent>
                            {members
                              .filter(m => !task.approval.approvers.includes(m.id))
                              .map(m => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}{m.department?.name ? ` (${m.department.name})` : ''}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* File URL */}
                      <div className="space-y-2">
                        <Label className="text-xs">関連ファイルURL（任意）</Label>
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input
                            type="url"
                            placeholder="https://www.dropbox.com/... や Google Drive のリンク等"
                            value={task.approval.file_url}
                            onChange={e => updateTaskApproval(task.id, 'file_url', e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Dropbox、Google Drive 等の共有リンクを入力してください</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => setActiveTab('tomorrow')} className="bg-emerald-600 hover:bg-emerald-700">
          次へ：翌日以降の予定を入力 <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      </>
      )}

      {activeTab === 'tomorrow' && (
      <>
      <Card>
        <CardHeader><CardTitle>翌日以降の予定</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* クイック追加ボタン */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addCurrentIncompleteToPlanned}>
              <ClipboardList className="mr-1 h-4 w-4" />
              ページ1の未完了タスクを追加
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addAllPastIncompleteToPlanned}>
              <ClipboardList className="mr-1 h-4 w-4" />
              過去の未完了タスクを全て追加
            </Button>
          </div>

          <div className="space-y-2">
            {plannedTasks.map((pt, i) => (
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
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">メモ（任意）</Label>
            <Textarea placeholder="翌日の予定を入力..." value={nextDayPlan} onChange={e => setNextDayPlan(e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* 提出履歴 (inline) */}
      <Card>
        <CardHeader><CardTitle className="text-base">提出履歴</CardTitle></CardHeader>
        <CardContent>
          {submittedHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">提出済みの日報はまだありません</p>
          ) : (
            <ul className="divide-y">
              {submittedHistory.map(r => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted-foreground tabular-nums w-24">{r.report_date}</span>
                  <span className="flex-1 truncate">{r.title || '(無題)'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${r.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{r.status === 'approved' ? '承認済み' : '提出済み'}</span>
                  <Button asChild variant="link" size="sm" className="ml-2 h-6 px-1 text-xs">
                    <a href={`/dashboard/reports/${r.id}`}>表示</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 期日遅れタスク (inline) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">期日遅れタスク</CardTitle>
          <Select value={overdueFilter} onValueChange={(v: any) => setOverdueFilter(v)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="incomplete">未完了のみ</SelectItem>
              <SelectItem value="in_progress">進行中のみ</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {(() => {
            const filtered = overdueTasks.filter(t => {
              if (overdueFilter === 'all') return true
              if (overdueFilter === 'in_progress') return t.task_status === '進行中'
              return t.task_status !== '完了'
            })
            if (filtered.length === 0) return <p className="text-sm text-muted-foreground">期日遅れのタスクはありません</p>
            return (
              <ul className="divide-y">
                {filtered.map(t => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm gap-2">
                    <span className="text-red-600 tabular-nums w-24">{t.due_date}</span>
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{t.progress_rate}%</span>
                    {t.task_status && <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{t.task_status}</span>}
                    <Button asChild variant="link" size="sm" className="h-6 px-1 text-xs">
                      <a href={`/dashboard/reports/${t.report_id}`}>表示</a>
                    </Button>
                  </li>
                ))}
              </ul>
            )
          })()}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={() => setActiveTab('today')}>
          <ArrowLeft className="mr-2 h-4 w-4" />本日の業務に戻る
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />下書き保存
          </Button>
          <Button onClick={() => handleSubmit('submitted')} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            <Send className="mr-2 h-4 w-4" />送信する
          </Button>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
