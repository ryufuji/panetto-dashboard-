'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface Template {
  id: string
  name: string
  description: string | null
  template_data: any
  is_default: boolean
  is_public: boolean
  created_by: string
  organization_id: string
  created_at: string
  creator?: { name: string }
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [formIsPublic, setFormIsPublic] = useState(false)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/templates')
      const json = await res.json()
      if (res.ok && json.data) {
        setTemplates(json.data)
      } else {
        toast.error(json.error || 'テンプレートの取得に失敗しました')
      }
    } catch {
      toast.error('テンプレートの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const openCreateDialog = () => {
    setEditingTemplate(null)
    setFormName('')
    setFormDescription('')
    setFormIsDefault(false)
    setFormIsPublic(false)
    setDialogOpen(true)
  }

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template)
    setFormName(template.name)
    setFormDescription(template.description || '')
    setFormIsDefault(template.is_default)
    setFormIsPublic(template.is_public)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('テンプレート名を入力してください')
      return
    }

    setSaving(true)
    try {
      if (editingTemplate) {
        // Update
        const res = await fetch('/api/reports/templates', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingTemplate.id,
            name: formName.trim(),
            description: formDescription.trim() || null,
            is_default: formIsDefault,
            is_public: formIsPublic,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setTemplates((prev) =>
            prev.map((t) => (t.id === editingTemplate.id ? json.data : t))
          )
          toast.success('テンプレートを更新しました')
          setDialogOpen(false)
        } else {
          toast.error(json.error || '更新に失敗しました')
        }
      } else {
        // Create
        const res = await fetch('/api/reports/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            template_data: {},
            is_default: formIsDefault,
            is_public: formIsPublic,
          }),
        })
        const json = await res.json()
        if (res.ok && json.data) {
          setTemplates((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
          toast.success('テンプレートを作成しました')
          setDialogOpen(false)
        } else {
          toast.error(json.error || '作成に失敗しました')
        }
      }
    } catch {
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/reports/templates?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id))
        toast.success('テンプレートを削除しました')
      } else {
        toast.error(json.error || '削除に失敗しました')
      }
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">日報テンプレート</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">日報テンプレート</h1>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />新規作成
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-blue-500" />
                <p className="font-semibold">{t.name}</p>
              </div>
              {t.description && (
                <p className="text-sm text-muted-foreground mb-3">{t.description}</p>
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-foreground">{t.creator?.name}</span>
                <div className="flex gap-1">
                  {t.is_default && <Badge>デフォルト</Badge>}
                  {t.is_public && <Badge variant="outline">公開</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDialog(t)}
                >
                  <Pencil className="mr-1 h-4 w-4" />編集
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => setDeleteTarget(t)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />削除
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <div className="col-span-3 flex flex-col items-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">テンプレートなし</p>
            <p className="text-sm mt-1">新規作成ボタンからテンプレートを追加してください</p>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'テンプレート編集' : 'テンプレート新規作成'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'テンプレートの情報を編集します'
                : '新しい日報テンプレートを作成します'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">
                テンプレート名 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="template-name"
                placeholder="例: 標準日報テンプレート"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">説明</Label>
              <Textarea
                id="template-description"
                placeholder="テンプレートの説明（任意）"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="template-default" className="font-medium">デフォルト</Label>
                <p className="text-xs text-muted-foreground">新規日報作成時に自動的に選択されます</p>
              </div>
              <Switch
                id="template-default"
                checked={formIsDefault}
                onCheckedChange={setFormIsDefault}
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="template-public" className="font-medium">公開</Label>
                <p className="text-xs text-muted-foreground">組織内の全ユーザーが使用できます</p>
              </div>
              <Switch
                id="template-public"
                checked={formIsPublic}
                onCheckedChange={setFormIsPublic}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate ? '更新' : '作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>テンプレートの削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.name}」を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
