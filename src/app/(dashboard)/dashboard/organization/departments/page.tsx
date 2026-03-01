'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pencil, Loader2, Building2, Users } from 'lucide-react'
import { toast } from 'sonner'

interface CreateForm {
  name: string
  code: string
  description: string
  manager_id: string
  parent_department_id: string
  order_index: number
}

interface EditForm {
  id: string
  name: string
  code: string
  description: string
  manager_id: string
  parent_department_id: string
  order_index: number
  is_active: boolean
}

const defaultCreateForm: CreateForm = {
  name: '',
  code: '',
  description: '',
  manager_id: '',
  parent_department_id: '',
  order_index: 0,
}

export default function DepartmentsPage() {
  const supabase = createClient()
  const [departments, setDepartments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editDept, setEditDept] = useState<any>(null)
  const [createForm, setCreateForm] = useState<CreateForm>(defaultCreateForm)
  const [editForm, setEditForm] = useState<EditForm>({
    id: '',
    name: '',
    code: '',
    description: '',
    manager_id: '',
    parent_department_id: '',
    order_index: 0,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const [deptsRes, usersRes] = await Promise.all([
      supabase
        .from('departments')
        .select('*, manager:users!fk_departments_manager(name)')
        .order('order_index'),
      supabase
        .from('users')
        .select('id, name, department_id')
        .eq('is_active', true)
        .order('name'),
    ])

    if (deptsRes.data) setDepartments(deptsRes.data)
    if (usersRes.data) setUsers(usersRes.data)

    if (authUser) {
      const { data: me } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single()
      setIsAdmin(me?.role === 'admin')
    }

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const getMemberCount = (deptId: string) => {
    return users.filter((u: any) => u.department_id === deptId).length
  }

  const openEdit = (dept: any) => {
    setEditDept(dept)
    setEditForm({
      id: dept.id,
      name: dept.name || '',
      code: dept.code || '',
      description: dept.description || '',
      manager_id: dept.manager_id || '',
      parent_department_id: dept.parent_department_id || '',
      order_index: dept.order_index ?? 0,
      is_active: dept.is_active ?? true,
    })
  }

  const handleCreate = async () => {
    if (!createForm.name || !createForm.code) {
      toast.error('部署名とコードは必須です')
      return
    }
    setSaving(true)
    const res = await fetch('/api/organization/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const json = await res.json()
    if (res.ok) {
      toast.success(`${createForm.name} を作成しました`)
      setShowCreate(false)
      setCreateForm(defaultCreateForm)
      fetchData()
    } else {
      toast.error(json.error || '作成に失敗しました')
    }
    setSaving(false)
  }

  const handleSave = async () => {
    if (!editForm.id) return
    setSaving(true)
    const res = await fetch('/api/organization/departments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const json = await res.json()
    if (res.ok) {
      toast.success(`${editForm.name} を更新しました`)
      setEditDept(null)
      fetchData()
    } else {
      toast.error(json.error || '更新に失敗しました')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">部署管理</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">部署管理</h1>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />新規作成
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept: any) => (
          <Card key={dept.id} className={dept.is_active === false ? 'opacity-50' : ''}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold">{dept.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">{dept.code}</Badge>
                  </div>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="icon" onClick={() => openEdit(dept)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {dept.description && (
                <p className="text-sm text-muted-foreground mb-3">{dept.description}</p>
              )}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">部署長</span>
                  <span>{dept.manager?.name || '未設定'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />メンバー
                  </span>
                  <span>{getMemberCount(dept.id)}名</span>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Badge variant={dept.is_active ? 'default' : 'outline'}>
                  {dept.is_active ? '有効' : '無効'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {departments.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Building2 className="h-8 w-8 mb-2 opacity-50" />
            <p>部署データなし</p>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規部署の作成</DialogTitle>
            <DialogDescription>新しい部署を登録します</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>部署名 *</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="例: 営業部"
                />
              </div>
              <div className="space-y-2">
                <Label>コード *</Label>
                <Input
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  placeholder="例: SALES"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>説明</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="部署の説明（任意）"
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>部署長</Label>
                <Select
                  value={createForm.manager_id}
                  onValueChange={(v) => setCreateForm({ ...createForm, manager_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="部署長を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未設定</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>親部署</Label>
                <Select
                  value={createForm.parent_department_id}
                  onValueChange={(v) => setCreateForm({ ...createForm, parent_department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="親部署を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {departments.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>表示順</Label>
              <Input
                type="number"
                value={createForm.order_index}
                onChange={(e) => setCreateForm({ ...createForm, order_index: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDept} onOpenChange={() => setEditDept(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>部署情報の編集</DialogTitle>
            <DialogDescription>{editDept?.name}（{editDept?.code}）</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>部署名</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例: 営業部"
                />
              </div>
              <div className="space-y-2">
                <Label>コード</Label>
                <Input
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例: SALES"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>説明</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="部署の説明（任意）"
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>部署長</Label>
                <Select
                  value={editForm.manager_id}
                  onValueChange={(v) => setEditForm({ ...editForm, manager_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="部署長を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未設定</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>親部署</Label>
                <Select
                  value={editForm.parent_department_id}
                  onValueChange={(v) => setEditForm({ ...editForm, parent_department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="親部署を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {departments
                      .filter((d: any) => d.id !== editForm.id)
                      .map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>表示順</Label>
                <Input
                  type="number"
                  value={editForm.order_index}
                  onChange={(e) => setEditForm({ ...editForm, order_index: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                />
                <Label>{editForm.is_active ? '有効' : '無効'}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDept(null)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
