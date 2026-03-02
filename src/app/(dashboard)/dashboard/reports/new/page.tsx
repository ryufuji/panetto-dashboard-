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
import { Plus, Trash2, Save, Send, GripVertical, X, ClipboardCheck, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { type Task, type TaskApproval, type PlannedTask, defaultApproval } from '@/types/report'
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
  const [progressRate, setProgressRate] = useState('')
  const [nextDayPlan, setNextDayPlan] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const [tasks, setTasks] = useState<Task[]>([
    { id: crypto.randomUUID(), title: '', description: '', estimated_hours: '', actual_hours: '', progress_rate: 0, task_type: '', priority: 'medium', start_date: today, due_date: '', parent_id: null, approval: defaultApproval() }
  ])
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([])
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

      // Load threshold rules
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
    setTasks([...tasks, {
      id: crypto.randomUUID(), title: '', description: '', estimated_hours: '', actual_hours: '',
      progress_rate: 0, task_type: '', priority: 'medium', start_date: today, due_date: '', parent_id: parentId, approval: defaultApproval()
    }])
  }

  const removeTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id && t.parent_id !== id))
  }

  const updateTask = (id: string, field: string, value: any) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

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
        department_id: profile.department_id,
        report_date: reportDate,
        title: title || null,
        work_hours: workHours ? parseFloat(workHours) : null,
        progress_rate: progressRate ? parseInt(progressRate) : null,
        next_day_plan: nextDayPlan || null,
        status,
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
          due_date: pt.due_date || null,
          order_index: i,
        }).select().single()

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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">日報作成</h1>
        <p className="text-muted-foreground">業務内容を記録してください</p>
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>稼働時間</Label>
              <Input type="number" step="0.5" placeholder="8.0" value={workHours} onChange={e => setWorkHours(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>全体進捗率（%）</Label>
              <Input type="number" min="0" max="100" placeholder="75" value={progressRate} onChange={e => setProgressRate(e.target.value)} />
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
                <div className="grid grid-cols-6 gap-2">
                  <div><Label className="text-xs">見積(h)</Label><Input type="number" step="0.5" value={task.estimated_hours} onChange={e => updateTask(task.id, 'estimated_hours', e.target.value)} /></div>
                  <div><Label className="text-xs">実績(h)</Label><Input type="number" step="0.5" value={task.actual_hours} onChange={e => updateTask(task.id, 'actual_hours', e.target.value)} /></div>
                  <div><Label className="text-xs">進捗(%)</Label><Input type="number" min="0" max="100" value={task.progress_rate} onChange={e => updateTask(task.id, 'progress_rate', parseInt(e.target.value) || 0)} /></div>
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
                  <div><Label className="text-xs">期限</Label><Input type="date" value={task.due_date} onChange={e => updateTask(task.id, 'due_date', e.target.value)} /></div>
                </div>

                {children.map((child, j) => (
                  <div key={child.id} className="ml-6 rounded-lg border border-dashed p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">子課題 {j + 1}</span>
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" className="text-red-500 h-6" onClick={() => removeTask(child.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                    <Input placeholder="タスク名" value={child.title} onChange={e => updateTask(child.id, 'title', e.target.value)} />
                    <div className="grid grid-cols-5 gap-2">
                      <div><Label className="text-xs">見積(h)</Label><Input type="number" step="0.5" value={child.estimated_hours} onChange={e => updateTask(child.id, 'estimated_hours', e.target.value)} /></div>
                      <div><Label className="text-xs">実績(h)</Label><Input type="number" step="0.5" value={child.actual_hours} onChange={e => updateTask(child.id, 'actual_hours', e.target.value)} /></div>
                      <div><Label className="text-xs">進捗(%)</Label><Input type="number" min="0" max="100" value={child.progress_rate} onChange={e => updateTask(child.id, 'progress_rate', parseInt(e.target.value) || 0)} /></div>
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

      <Card>
        <CardHeader><CardTitle>翌日の予定</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={loading}>
          <Save className="mr-2 h-4 w-4" />下書き保存
        </Button>
        <Button onClick={() => handleSubmit('submitted')} disabled={loading}>
          <Send className="mr-2 h-4 w-4" />提出して確認依頼
        </Button>
      </div>
    </div>
  )
}
