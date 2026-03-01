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
import { Plus, Pencil, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'

interface OfficeForm {
  name: string
  code: string
  address: string
  phone: string
  manager_id: string
}

interface EditOfficeForm extends OfficeForm {
  is_active: boolean
}

export default function OfficesPage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<OfficeForm>({
    name: '',
    code: '',
    address: '',
    phone: '',
    manager_id: '',
  })

  const [editOffice, setEditOffice] = useState<any>(null)
  const [editForm, setEditForm] = useState<EditOfficeForm>({
    name: '',
    code: '',
    address: '',
    phone: '',
    manager_id: '',
    is_active: true,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const [officesRes, usersRes] = await Promise.all([
      supabase
        .from('offices')
        .select('*, manager:users!fk_offices_manager(name)')
        .order('name'),
      supabase
        .from('users')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
    ])

    if (officesRes.data) setOffices(officesRes.data)
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

  const openEdit = (office: any) => {
    setEditOffice(office)
    setEditForm({
      name: office.name || '',
      code: office.code || '',
      address: office.address || '',
      phone: office.phone || '',
      manager_id: office.manager_id || '',
      is_active: office.is_active,
    })
  }

  const handleCreate = async () => {
    if (!createForm.name || !createForm.code) {
      toast.error('拠点名とコードは必須です')
      return
    }
    setSaving(true)

    const res = await fetch('/api/organization/offices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const json = await res.json()

    if (res.ok) {
      setOffices((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(`${createForm.name} を作成しました`)
      setShowCreate(false)
      setCreateForm({ name: '', code: '', address: '', phone: '', manager_id: '' })
    } else {
      toast.error(json.error || '作成に失敗しました')
    }
    setSaving(false)
  }

  const handleSave = async () => {
    if (!editOffice) return
    setSaving(true)

    const res = await fetch('/api/organization/offices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editOffice.id,
        name: editForm.name,
        code: editForm.code,
        address: editForm.address,
        phone: editForm.phone,
        manager_id: editForm.manager_id,
        is_active: editForm.is_active,
      }),
    })
    const json = await res.json()

    if (res.ok) {
      setOffices((prev) =>
        prev
          .map((o) => (o.id === editOffice.id ? { ...o, ...json.data } : o))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      toast.success(`${editForm.name} を更新しました`)
      setEditOffice(null)
    } else {
      toast.error(json.error || '更新に失敗しました')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">拠点管理</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">拠点管理</h1>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />新規作成
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {offices.map((o: any) => (
          <Card key={o.id} className={o.is_active ? '' : 'opacity-50'}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-semibold">{o.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">{o.code}</Badge>
                  </div>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="icon" onClick={() => openEdit(o)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {o.address && <p className="text-sm text-muted-foreground mb-1">{o.address}</p>}
              {o.phone && <p className="text-sm text-muted-foreground mb-1">{o.phone}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">拠点長: {o.manager?.name || '未設定'}</span>
                <Badge variant={o.is_active ? 'default' : 'outline'}>{o.is_active ? '有効' : '無効'}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {offices.length === 0 && (
          <div className="col-span-2 flex flex-col items-center py-16 text-muted-foreground">
            <MapPin className="h-8 w-8 mb-2 opacity-50" />
            拠点データなし
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規拠点の作成</DialogTitle>
            <DialogDescription>新しい拠点を登録します</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>拠点名 *</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="例: 東京本社"
                />
              </div>
              <div className="space-y-2">
                <Label>コード *</Label>
                <Input
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  placeholder="例: TOKYO"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>住所</Label>
              <Input
                value={createForm.address}
                onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                placeholder="例: 東京都渋谷区..."
              />
            </div>
            <div className="space-y-2">
              <Label>電話番号</Label>
              <Input
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="例: 03-1234-5678"
              />
            </div>
            <div className="space-y-2">
              <Label>拠点長</Label>
              <Select
                value={createForm.manager_id}
                onValueChange={(v) => setCreateForm({ ...createForm, manager_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="拠点長を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
      <Dialog open={!!editOffice} onOpenChange={() => setEditOffice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拠点の編集</DialogTitle>
            <DialogDescription>{editOffice?.name} の情報を編集します</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>拠点名</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="例: 東京本社"
                />
              </div>
              <div className="space-y-2">
                <Label>コード</Label>
                <Input
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  placeholder="例: TOKYO"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>住所</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder="例: 東京都渋谷区..."
              />
            </div>
            <div className="space-y-2">
              <Label>電話番号</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="例: 03-1234-5678"
              />
            </div>
            <div className="space-y-2">
              <Label>拠点長</Label>
              <Select
                value={editForm.manager_id}
                onValueChange={(v) => setEditForm({ ...editForm, manager_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="拠点長を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>有効</Label>
                <p className="text-xs text-muted-foreground">無効にすると選択肢に表示されなくなります</p>
              </div>
              <Switch
                checked={editForm.is_active}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOffice(null)} disabled={saving}>
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
