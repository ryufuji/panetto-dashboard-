'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight, LayoutTemplate } from 'lucide-react'
import { toast } from 'sonner'

// ─── ローカル型 ───────────────────────────────────────────
interface TemplateItem {
  tempId: string
  parentTempId: string | null
  title: string
  estimatedHours: string
  taskType: string
  priority: string
  purpose: string
  memo: string
  orderIndex: number
}

interface Template {
  id: string
  name: string
  description: string
  items: any[]
  created_at: string
}

// ─── ユーティリティ ───────────────────────────────────────
function newItem(parentTempId: string | null, orderIndex: number): TemplateItem {
  return {
    tempId: crypto.randomUUID(),
    parentTempId,
    title: '',
    estimatedHours: '',
    taskType: '',
    priority: 'medium',
    purpose: '',
    memo: '',
    orderIndex,
  }
}

// ─── 子タスク行 ───────────────────────────────────────────
function ChildRow({
  item,
  onChange,
  onRemove,
}: {
  item: TemplateItem
  onChange: (id: string, field: keyof TemplateItem, value: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="ml-6 flex items-center gap-2 rounded border-l-2 border-blue-200 bg-blue-50/50 p-2">
      <span className="text-xs text-muted-foreground w-14 shrink-0">子タスク</span>
      <Input
        className="h-7 text-sm flex-1"
        placeholder="タスク名"
        value={item.title}
        onChange={e => onChange(item.tempId, 'title', e.target.value)}
      />
      <Input
        className="h-7 text-sm w-20"
        type="number"
        min="0"
        step="0.5"
        placeholder="時間"
        value={item.estimatedHours}
        onChange={e => onChange(item.tempId, 'estimatedHours', e.target.value)}
      />
      <span className="text-xs text-muted-foreground">h</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
        onClick={() => onRemove(item.tempId)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── テンプレート編集フォーム ─────────────────────────────
function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Template | null
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [saving, setSaving] = useState(false)

  // items 初期化（既存テンプレートの場合）
  const [items, setItems] = useState<TemplateItem[]>(() => {
    if (!initial?.items?.length) {
      const parentId = crypto.randomUUID()
      return [
        { tempId: parentId, parentTempId: null, title: '', estimatedHours: '', taskType: '', priority: 'medium', purpose: '', memo: '', orderIndex: 0 },
      ]
    }
    // DBデータをローカル形式に変換
    const dbItems = initial.items
    const idMap = new Map<string, string>() // db id → tempId
    dbItems.forEach((it: any) => idMap.set(it.id, crypto.randomUUID()))
    return dbItems.map((it: any) => ({
      tempId: idMap.get(it.id) || crypto.randomUUID(),
      parentTempId: it.parent_item_id ? (idMap.get(it.parent_item_id) || null) : null,
      title: it.title || '',
      estimatedHours: it.estimated_hours != null ? String(it.estimated_hours) : '',
      taskType: it.task_type || '',
      priority: it.priority || 'medium',
      purpose: it.purpose || '',
      memo: it.memo || '',
      orderIndex: it.order_index ?? 0,
    }))
  })

  const parentItems = items.filter(i => !i.parentTempId)
  const childrenOf = (pid: string) => items.filter(i => i.parentTempId === pid)

  const addParent = () => {
    setItems(prev => [
      ...prev,
      newItem(null, parentItems.length),
    ])
  }

  const addChild = (parentTempId: string) => {
    const siblings = items.filter(i => i.parentTempId === parentTempId)
    setItems(prev => [...prev, newItem(parentTempId, siblings.length)])
  }

  const updateItem = (tempId: string, field: keyof TemplateItem, value: string) => {
    setItems(prev => prev.map(i => i.tempId === tempId ? { ...i, [field]: value } : i))
  }

  const removeItem = (tempId: string) => {
    // 子も一緒に削除
    setItems(prev => prev.filter(i => i.tempId !== tempId && i.parentTempId !== tempId))
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('テンプレート名を入力してください'); return }
    const validParents = parentItems.filter(p => p.title.trim())
    if (validParents.length === 0) { toast.error('親タスクを1件以上入力してください'); return }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        items: items
          .filter(i => i.title.trim())
          .map((i, idx) => ({ ...i, orderIndex: idx })),
      }
      const url = initial
        ? `/api/organization/task-templates/${initial.id}`
        : '/api/organization/task-templates'
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(initial ? 'テンプレートを更新しました' : 'テンプレートを作成しました')
      onSave()
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{initial ? 'テンプレートを編集' : '新規テンプレート'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>テンプレート名 <span className="text-red-500">*</span></Label>
          <Input placeholder="例: 店舗開発" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>説明（任意）</Label>
          <Textarea rows={2} placeholder="このテンプレートの用途や概要" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>タスク構成</Label>
            <span className="text-xs text-muted-foreground">親タスク {parentItems.filter(p => p.title).length} 件</span>
          </div>

          {parentItems.map((parent, pi) => (
            <div key={parent.tempId} className="space-y-2 rounded-lg border p-3">
              {/* 親タスク行 */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">親タスク {pi + 1}</span>
                <Input
                  className="flex-1 text-sm"
                  placeholder="タスク名（例: 物件契約）"
                  value={parent.title}
                  onChange={e => updateItem(parent.tempId, 'title', e.target.value)}
                />
                <Input
                  className="w-20 text-sm"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="時間"
                  value={parent.estimatedHours}
                  onChange={e => updateItem(parent.tempId, 'estimatedHours', e.target.value)}
                />
                <span className="text-xs text-muted-foreground">h</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-blue-600 hover:text-blue-800 text-xs px-2"
                  onClick={() => addChild(parent.tempId)}
                >
                  <Plus className="h-3 w-3 mr-1" />子タスク
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                  onClick={() => removeItem(parent.tempId)}
                  disabled={parentItems.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* 子タスク */}
              {childrenOf(parent.tempId).map(child => (
                <ChildRow key={child.tempId} item={child} onChange={updateItem} onRemove={removeItem} />
              ))}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addParent} className="w-full">
            <Plus className="h-4 w-4 mr-1" />親タスクを追加
          </Button>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>キャンセル</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />{saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── メインページ ─────────────────────────────────────────
export default function TaskTemplatesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single()
      if ((profile as any)?.role !== 'admin') {
        toast.error('管理者のみアクセスできます')
        router.push('/dashboard')
        return
      }
      setIsAdmin(true)
      await loadTemplates()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTemplates = async () => {
    const res = await fetch('/api/organization/task-templates')
    const json = await res.json()
    if (res.ok) setTemplates(json.data || [])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除しますか？')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/organization/task-templates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('削除しました')
      await loadTemplates()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeleting(null)
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  if (loading) return <div className="p-6 text-muted-foreground">読み込み中...</div>
  if (!isAdmin) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6 text-blue-600" />タスクテンプレート管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            日報作成時に使える親タスク＋子タスクのセットをテンプレートとして登録します
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => { setEditTarget(null); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-1" />新規作成
          </Button>
        )}
      </div>

      {/* 新規 / 編集フォーム */}
      {showForm && (
        <TemplateForm
          initial={editTarget}
          onSave={async () => { setShowForm(false); setEditTarget(null); await loadTemplates() }}
          onCancel={() => { setShowForm(false); setEditTarget(null) }}
        />
      )}

      {/* テンプレート一覧 */}
      {templates.length === 0 && !showForm ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            テンプレートがまだありません。「新規作成」から追加してください。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map(tmpl => {
            const parentItems = tmpl.items.filter((i: any) => !i.parent_item_id)
            const isOpen = expanded.has(tmpl.id)
            return (
              <Card key={tmpl.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(tmpl.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <span className="font-medium">{tmpl.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        親タスク {parentItems.length} 件
                      </span>
                      {tmpl.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-xs">
                          — {tmpl.description}
                        </span>
                      )}
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-blue-600"
                        onClick={() => { setEditTarget(tmpl); setShowForm(true) }}
                        disabled={!!showForm}
                      >
                        <Edit2 className="h-3.5 w-3.5 mr-1" />編集
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-500"
                        onClick={() => handleDelete(tmpl.id)}
                        disabled={deleting === tmpl.id}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />削除
                      </Button>
                    </div>
                  </div>

                  {/* 展開時：タスク一覧 */}
                  {isOpen && (
                    <div className="mt-3 space-y-2 pl-6">
                      {parentItems.map((parent: any, pi: number) => {
                        const children = tmpl.items.filter((i: any) => i.parent_item_id === parent.id)
                        return (
                          <div key={parent.id} className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground text-xs w-6">{pi + 1}.</span>
                              <span className="font-medium">{parent.title}</span>
                              {parent.estimated_hours != null && (
                                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {parent.estimated_hours}h
                                </span>
                              )}
                            </div>
                            {children.map((child: any, ci: number) => (
                              <div key={child.id} className="flex items-center gap-2 text-sm ml-6">
                                <span className="text-muted-foreground text-xs w-6">{pi + 1}-{ci + 1}.</span>
                                <span className="text-slate-700">{child.title}</span>
                                {child.estimated_hours != null && (
                                  <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                    {child.estimated_hours}h
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
