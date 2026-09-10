'use client'

/**
 * 日報のタスク一覧（親タスク＋子タスク）の入力フォーム。
 * 新規作成ページと編集ページで同じ項目・同じ見た目になるよう、ここに一本化している。
 * ページ固有の要素（編集ページの期限延長申請など）はスロット props で差し込む。
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, GripVertical, X, ClipboardCheck, Link2, ChevronDown, ChevronRight, Repeat, Lock, ExternalLink } from 'lucide-react'
import { type Task, TASK_STATUS_OPTIONS, RECURRENCE_PATTERNS, type RecurrencePattern } from '@/types/report'

export function HelpTip({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600 hover:bg-slate-300"
      title={text}
    >
      ?
    </span>
  )
}

export const APPROVAL_CATEGORIES = [
  { value: 'equipment_purchase', label: '備品購入' },
  { value: 'document_review', label: '書類チェック' },
  { value: 'other', label: 'その他' },
]

const APPROVAL_STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-gray-50 text-gray-700' },
  pending: { label: '承認待ち', className: 'bg-orange-50 text-orange-700' },
  approved: { label: '承認済み', className: 'bg-green-50 text-green-700' },
  rejected: { label: '却下', className: 'bg-red-50 text-red-700' },
  cancelled: { label: '取消', className: 'bg-gray-50 text-gray-500' },
}

type Member = { id: string; name: string; role?: string; department?: { name?: string } | null }

export interface TaskListEditorProps {
  tasks: Task[]
  today: string
  members: Member[]
  defaultApproverId: string | null
  getRequiredSteps: (amount: string) => number
  updateTask: (taskId: string, field: string, value: any) => void
  updateTaskApproval: (taskId: string, field: string, value: any) => void
  addTask: (parentId: string | null) => void
  removeTask: (taskId: string) => void
  addApproverToTask: (taskId: string, userId: string) => void
  removeApproverFromTask: (taskId: string, userId: string) => void
  expandedParents: Set<string>
  toggleExpand: (parentId: string) => void
  /** 期日を変更不可にする条件（編集ページ: 提出済みで期限延長が必要なタスク） */
  isDueDateLocked?: (task: Task) => boolean
  /** メタ情報グリッドの直後に差し込む要素（編集ページ: 期限延長申請） */
  renderAfterMeta?: (task: Task) => ReactNode
}

const PRIORITY_ITEMS = (
  <SelectContent>
    <SelectItem value="high">高</SelectItem>
    <SelectItem value="medium">中</SelectItem>
    <SelectItem value="low">低</SelectItem>
  </SelectContent>
)

export function TaskListEditor({
  tasks, today, members, defaultApproverId, getRequiredSteps,
  updateTask, updateTaskApproval, addTask, removeTask, addApproverToTask, removeApproverFromTask,
  expandedParents, toggleExpand, isDueDateLocked, renderAfterMeta,
}: TaskListEditorProps) {
  const parentTasks = tasks.filter(t => !t.parent_id)

  return (
    <>
      {tasks.some(t => t.is_recurring && !t.parent_id) && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <Repeat className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            定期タスクが自動で追加されています（<span className="font-semibold">「定期」</span>バッジが目印）。手動での引き継ぎは不要です。
          </span>
        </div>
      )}

      {parentTasks.map((task, i) => {
        const children = tasks.filter(t => t.parent_id === task.id)
        const requiredSteps = getRequiredSteps(task.approval.amount)
        const locked = isDueDateLocked?.(task) ?? false
        const isExistingNonDraft = !!task.approval.existing_id && task.approval.existing_status !== 'draft'
        return (
          <div key={task.id} className={`rounded-lg border-2 p-4 space-y-3 shadow-sm ${task.is_recurring ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-300 bg-white'}`}>
            {/* タスクごとの境目が分かるよう、見出し行を帯にする */}
            <div className={`-mx-4 -mt-4 mb-1 flex items-center gap-2 rounded-t-md border-b px-4 py-2 ${task.is_recurring ? 'border-emerald-200 bg-emerald-100/60' : 'border-slate-200 bg-slate-100'}`}>
              <GripVertical className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-slate-700">親タスク {i + 1}</span>
              {task.is_recurring && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <Repeat className="h-3 w-3" />定期
                </span>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => addTask(task.id)}><Plus className="h-3 w-3 mr-1" />子タスク</Button>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => removeTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
            <div>
              <Label className="text-xs">タスク名（親）<HelpTip text="この日報で対応した業務内容" /></Label>
              <Input placeholder="タスク名" value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">詳細（親）<HelpTip text="業務の詳細・進め方・特記事項" /></Label>
              <Textarea placeholder="詳細（任意）" value={task.description} onChange={e => updateTask(task.id, 'description', e.target.value)} rows={2} />
            </div>

            {/* タスクメタ: 開始日 / 期日 / 進捗 / ステータス / 工数 / 優先度 */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <div>
                <Label className="text-xs">開始日<HelpTip text="このタスクに着手した日" /></Label>
                <Input type="date" value={task.start_date} onChange={e => updateTask(task.id, 'start_date', e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">期日 <span className="text-red-500">(*)</span><HelpTip text="このタスクを完了させる期限" /></Label>
                  {!locked && (
                    <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => updateTask(task.id, 'due_date', today)}>本日</Button>
                  )}
                </div>
                {locked ? (
                  <div className="flex items-center gap-1">
                    <Input type="date" value={task.due_date} disabled className="bg-gray-50" />
                    <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  </div>
                ) : (
                  <>
                    <Input type="date" value={task.due_date} onChange={e => updateTask(task.id, 'due_date', e.target.value)} disabled={!!task.no_due_date} />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <input type="checkbox" checked={!!task.no_due_date} onChange={e => updateTask(task.id, 'no_due_date', e.target.checked)} />期日なし
                    </label>
                  </>
                )}
              </div>
              {task.is_recurring ? (
                // 定期タスクは毎日繰り返す業務なので、進捗率とステータスの代わりに「本日実施済み」の1チェックで記録する
                // （内部では 100%／完了、未チェックは 0%／未着手 として保存。通知や集計は従来と同じ）
                <div className="md:col-span-2">
                  <Label className="text-xs">本日の実施<HelpTip text="実施したらチェック。完了として記録され、次回該当日にまた取り込まれます" /></Label>
                  <label className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={(task.progress_rate ?? 0) >= 100 || task.task_status === '完了'}
                      onChange={e => {
                        const done = e.target.checked
                        updateTask(task.id, 'progress_rate', done ? 100 : 0)
                        updateTask(task.id, 'task_status', done ? '完了' : '未着手')
                      }}
                    />
                    本日実施済み
                  </label>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">進捗(%) <span className="text-red-500">(*)</span><HelpTip text="現時点の完了率（0〜100）" /></Label>
                    <Input type="number" min="0" max="100" placeholder="0" value={task.progress_rate || ''} onChange={e => updateTask(task.id, 'progress_rate', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <Label className="text-xs">ステータス <span className="text-red-500">(*)</span><HelpTip text="現在の作業状況" /></Label>
                    <Select value={task.task_status || ''} onValueChange={v => updateTask(task.id, 'task_status', v)}>
                      <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div>
                <Label className="text-xs">工数(h) <span className="text-red-500">(*)</span><HelpTip text="子タスクがある場合は子タスクの合計が自動設定されます。ない場合は見込み時間を入力してください" /></Label>
                {children.length > 0 ? (
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted/30 text-sm gap-1">
                    <span className="font-medium">{children.reduce((sum, c) => sum + (parseFloat(c.estimated_hours) || 0), 0)}</span>
                    <span className="text-xs text-muted-foreground">h（子タスク合計）</span>
                  </div>
                ) : (
                  <Input type="number" step="0.5" placeholder="0.5" value={task.estimated_hours} onChange={e => updateTask(task.id, 'estimated_hours', e.target.value)} />
                )}
              </div>
              <div>
                <Label className="text-xs">優先度<HelpTip text="高：今日必ず完了、中：通常、低：余裕があれば" /></Label>
                <Select value={task.priority} onValueChange={v => updateTask(task.id, 'priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  {PRIORITY_ITEMS}
                </Select>
              </div>
            </div>

            {renderAfterMeta?.(task)}

            {/* 備考・メモ */}
            <div className="space-y-1">
              <Label className="text-xs">備考・メモ (任意)<HelpTip text="補足情報・懸念事項・引き継ぎ事項など" /></Label>
              <Textarea placeholder="備考やメモを入力" value={task.memo || ''} onChange={e => updateTask(task.id, 'memo', e.target.value)} rows={2} />
            </div>

            {/* 目的 */}
            <div className="space-y-1">
              <Label className="text-xs">目的<HelpTip text="このタスクに取り組む理由・背景。メモと同じく日報通知に反映されます" /></Label>
              <Textarea placeholder="この課題の目的・背景" value={task.purpose || ''} onChange={e => updateTask(task.id, 'purpose', e.target.value)} rows={2} />
            </div>

            {/* 省略 / 定期タスク フラグ */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={!!task.is_omitted} onChange={e => updateTask(task.id, 'is_omitted', e.target.checked)} />
                省略
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={!!task.is_recurring}
                  onChange={e => {
                    updateTask(task.id, 'is_recurring', e.target.checked)
                    if (e.target.checked && !task.recurrence_pattern) {
                      updateTask(task.id, 'recurrence_pattern', 'daily')
                    }
                  }}
                />
                <Repeat className="h-3 w-3 inline" />定期タスク
              </label>
              {task.is_recurring && (
                <Select
                  value={task.recurrence_pattern || 'daily'}
                  onValueChange={v => updateTask(task.id, 'recurrence_pattern', v as RecurrencePattern)}
                >
                  <SelectTrigger className="h-7 w-48 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_PATTERNS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {task.is_recurring && (
                <span className="text-xs text-muted-foreground">※ 次回該当日に自動で取り込まれます</span>
              )}
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
                  const m = members.find(mm => mm.id === uid)
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
                    {members.filter(m => !(task.shared_user_ids || []).includes(m.id)).map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ノルマ目標 / 今日の成果 */}
            {!task.no_norma && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><Label className="text-xs">ノルマ(目標) 件数<HelpTip text="今日達成すべき目標件数" /></Label><Input type="number" placeholder="例: 500" value={task.target_norma_count || ''} onChange={e => updateTask(task.id, 'target_norma_count', e.target.value)} /></div>
                <div><Label className="text-xs">ノルマ(目標) 金額<HelpTip text="今日達成すべき目標金額（円）" /></Label><Input type="number" placeholder="例: 500000" value={task.target_norma_amount || ''} onChange={e => updateTask(task.id, 'target_norma_amount', e.target.value)} /></div>
                <div><Label className="text-xs">今日の成果 件数<HelpTip text="今日実際に達成した件数" /></Label><Input type="number" placeholder="例: 250" value={task.today_result_count || ''} onChange={e => updateTask(task.id, 'today_result_count', e.target.value)} /></div>
                <div><Label className="text-xs">今日の成果 金額<HelpTip text="今日実際に達成した金額（円）" /></Label><Input type="number" placeholder="例: 250000" value={task.today_result_amount || ''} onChange={e => updateTask(task.id, 'today_result_amount', e.target.value)} /></div>
              </div>
            )}
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={!!task.no_norma} onChange={e => updateTask(task.id, 'no_norma', e.target.checked)} />ノルマなし
            </label>

            {/* 子タスクは展開式 */}
            {children.length > 0 && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => toggleExpand(task.id)}>
                {expandedParents.has(task.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                子タスク {children.length}件{expandedParents.has(task.id) ? 'を非表示' : 'を表示'}
              </Button>
            )}
            {expandedParents.has(task.id) && children.map((child, j) => (
              <div key={child.id} className="ml-6 rounded-lg border border-dashed p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">子タスク {j + 1}</span>
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ステータス</Label>
                    <Select value={child.task_status || ''} onValueChange={v => updateTask(child.id, 'task_status', v)}>
                      <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">優先度 <HelpTip text="高：今日必ず完了、中：通常、低：余裕があれば" /></Label>
                    <Select value={child.priority} onValueChange={v => updateTask(child.id, 'priority', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      {PRIORITY_ITEMS}
                    </Select>
                  </div>
                </div>
                {!child.no_norma && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div><Label className="text-xs">ノルマ(目標) 件数</Label><Input type="number" placeholder="例: 500" value={child.target_norma_count || ''} onChange={e => updateTask(child.id, 'target_norma_count', e.target.value)} /></div>
                    <div><Label className="text-xs">ノルマ(目標) 金額</Label><Input type="number" placeholder="例: 500000" value={child.target_norma_amount || ''} onChange={e => updateTask(child.id, 'target_norma_amount', e.target.value)} /></div>
                    <div><Label className="text-xs">今日の成果 件数</Label><Input type="number" placeholder="例: 250" value={child.today_result_count || ''} onChange={e => updateTask(child.id, 'today_result_count', e.target.value)} /></div>
                    <div><Label className="text-xs">今日の成果 金額</Label><Input type="number" placeholder="例: 250000" value={child.today_result_amount || ''} onChange={e => updateTask(child.id, 'today_result_amount', e.target.value)} /></div>
                  </div>
                )}
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!child.no_norma} onChange={e => updateTask(child.id, 'no_norma', e.target.checked)} />ノルマなし
                </label>
              </div>
            ))}

            {/* 承認申請 */}
            <div className="mt-2 border-t pt-3">
              {isExistingNonDraft ? (
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
                  <ClipboardCheck className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{task.approval.title}</span>
                      <Badge className={APPROVAL_STATUS_MAP[task.approval.existing_status || 'draft']?.className}>
                        {APPROVAL_STATUS_MAP[task.approval.existing_status || 'draft']?.label}
                      </Badge>
                    </div>
                    {task.approval.amount && (
                      <p className="text-xs text-muted-foreground mt-1">金額: ¥{Number(task.approval.amount).toLocaleString()}</p>
                    )}
                  </div>
                  <Link href={`/dashboard/approval-requests/${task.approval.existing_id}`}>
                    <Button variant="ghost" size="sm"><ExternalLink className="h-3 w-3 mr-1" />詳細</Button>
                  </Link>
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={task.approval.enabled} onChange={e => updateTaskApproval(task.id, 'enabled', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                    <ClipboardCheck className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">承認申請を行う</span>
                  </label>
                  <p className="ml-6 text-xs text-muted-foreground">備品購入・書類確認など上長の承認が必要な場合のみチェック。ルーティン業務は不要です。</p>

                  {task.approval.enabled && (
                    <div className="mt-3 ml-6 space-y-3 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs">申請タイトル <span className="text-red-500">*</span></Label>
                        <Input placeholder="申請タイトル" value={task.approval.title} onChange={e => updateTaskApproval(task.id, 'title', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">カテゴリ</Label>
                        <Select value={task.approval.category} onValueChange={v => updateTaskApproval(task.id, 'category', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {APPROVAL_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {task.approval.category === 'other' && (
                        <div className="space-y-2">
                          <Label className="text-xs">カテゴリ名 <span className="text-red-500">*</span></Label>
                          <Input placeholder="カテゴリ名を入力" value={task.approval.custom_category} onChange={e => updateTaskApproval(task.id, 'custom_category', e.target.value)} />
                        </div>
                      )}
                      {task.approval.category === 'equipment_purchase' && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs">使用目的</Label>
                            <Input placeholder="例: 営業資料の印刷用" value={task.approval.equipment_purpose} onChange={e => updateTaskApproval(task.id, 'equipment_purpose', e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">使用者</Label>
                            <Input placeholder="例: 営業部 田中太郎" value={task.approval.equipment_user} onChange={e => updateTaskApproval(task.id, 'equipment_user', e.target.value)} />
                          </div>
                        </>
                      )}
                      <div className="space-y-2">
                        <Label className="text-xs">金額</Label>
                        <Input type="number" placeholder="金額（円）" value={task.approval.amount} onChange={e => updateTaskApproval(task.id, 'amount', e.target.value)} />
                        {task.approval.amount && (
                          <p className="text-xs text-muted-foreground">この金額には{requiredSteps}段階の承認が必要です</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">説明（任意）</Label>
                        <Textarea placeholder="申請の詳細を入力" value={task.approval.description} onChange={e => updateTaskApproval(task.id, 'description', e.target.value)} rows={2} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">承認者</Label>
                        {task.approval.approvers.length > 0 && (
                          <div className="space-y-1">
                            {task.approval.approvers.map((uid, index) => {
                              const member = members.find(m => m.id === uid)
                              return (
                                <div key={uid} className="flex items-center gap-2 rounded border bg-white p-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">{index + 1}</span>
                                  <span className="flex-1 text-sm">{member?.name || '不明'}{uid === defaultApproverId && <span className="text-xs text-blue-600 ml-1">(部署長)</span>}</span>
                                  <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeApproverFromTask(task.id, uid)}>
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
                              .filter(m => (m.role === 'admin' || m.role === 'manager') && !task.approval.approvers.includes(m.id))
                              .map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name}{m.department?.name ? ` (${m.department.name})` : ''}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">関連ファイルURL（任意）</Label>
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input type="url" placeholder="https://www.dropbox.com/... や Google Drive のリンク等" value={task.approval.file_url} onChange={e => updateTaskApproval(task.id, 'file_url', e.target.value)} />
                        </div>
                        <p className="text-xs text-muted-foreground">Dropbox、Google Drive 等の共有リンクを入力してください</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* タスクリスト下部の親タスク追加ボタン（スクロールせずに追加できるように） */}
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed text-muted-foreground hover:text-foreground"
        onClick={() => addTask(null)}
      >
        <Plus className="mr-1 h-4 w-4" />親タスク追加
      </Button>
    </>
  )
}
