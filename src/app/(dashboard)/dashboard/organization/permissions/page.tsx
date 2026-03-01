'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, Users, Key, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const roleLabels: Record<string, string> = {
  admin: '管理者',
  manager: '部署長',
  employee: '一般',
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  manager: 'secondary',
  employee: 'outline',
}

const PERMISSIONS = [
  { key: 'reports.create', label: '日報作成', group: '日報' },
  { key: 'reports.approve', label: '日報承認', group: '日報' },
  { key: 'reports.export', label: '日報エクスポート', group: '日報' },
  { key: 'stores.manage', label: '店舗管理', group: '店舗' },
  { key: 'stores.sales', label: '売上管理', group: '店舗' },
  { key: 'board.post', label: '掲示板投稿', group: 'ポータル' },
  { key: 'board.pin', label: '掲示板ピン留め', group: 'ポータル' },
  { key: 'users.manage', label: 'ユーザー管理', group: '組織' },
  { key: 'files.upload', label: 'ファイルアップロード', group: 'ポータル' },
  { key: 'settings.system', label: 'システム設定', group: '設定' },
]

const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]

interface UserWithPermissions {
  id: string
  name: string
  email: string
  role: string
  avatar_url?: string
  department?: { name: string }
  office?: { name: string }
  permissions: string[]
}

export default function PermissionsPage() {
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [loading, setLoading] = useState(true)
  const [roleDialog, setRoleDialog] = useState<{ user: UserWithPermissions; newRole: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [permSaving, setPermSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/organization/permissions')
    const json = await res.json()
    if (json.data) {
      setUsers(json.data)
      if (!selectedUserId && json.data.length > 0) {
        setSelectedUserId(json.data[0].id)
      }
    }
    setLoading(false)
  }, [selectedUserId])

  useEffect(() => {
    fetchUsers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleChange = (user: UserWithPermissions, newRole: string) => {
    if (newRole === user.role) return
    setRoleDialog({ user, newRole })
  }

  const confirmRoleChange = async () => {
    if (!roleDialog) return
    setSaving(true)
    const res = await fetch('/api/organization/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: roleDialog.user.id, role: roleDialog.newRole }),
    })
    const json = await res.json()
    if (res.ok) {
      toast.success(`${roleDialog.user.name} のロールを${roleLabels[roleDialog.newRole]}に変更しました`)
      setUsers((prev) =>
        prev.map((u) => (u.id === roleDialog.user.id ? { ...u, role: roleDialog.newRole } : u))
      )
    } else {
      toast.error(json.error || 'ロール変更に失敗しました')
    }
    setSaving(false)
    setRoleDialog(null)
  }

  const selectedUser = users.find((u) => u.id === selectedUserId)

  const togglePermission = async (permKey: string) => {
    if (!selectedUser) return
    setPermSaving(true)
    const current = selectedUser.permissions
    const next = current.includes(permKey)
      ? current.filter((p) => p !== permKey)
      : [...current, permKey]

    const res = await fetch(`/api/organization/permissions/${selectedUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: next }),
    })
    const json = await res.json()
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, permissions: json.data.map((p: any) => p.permission) }
            : u
        )
      )
      toast.success('パーミッションを更新しました')
    } else {
      toast.error(json.error || 'パーミッション更新に失敗しました')
    }
    setPermSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">権限管理</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">権限管理</h1>
        <p className="text-muted-foreground">ユーザーのロールと個別パーミッションを管理します</p>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            ロール管理
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Key className="h-4 w-4" />
            個別パーミッション
          </TabsTrigger>
        </TabsList>

        {/* Role Management Tab */}
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ロール管理</CardTitle>
              <CardDescription>
                各ユーザーのロール（管理者・部署長・一般）を変更できます
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ユーザー</TableHead>
                    <TableHead>部署</TableHead>
                    <TableHead>拠点</TableHead>
                    <TableHead>現在のロール</TableHead>
                    <TableHead>ロール変更</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.name} />}
                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                              {u.name?.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{u.department?.name || '-'}</TableCell>
                      <TableCell className="text-sm">{u.office?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant[u.role] || 'outline'}>
                          {roleLabels[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => handleRoleChange(u, v)}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">管理者</SelectItem>
                            <SelectItem value="manager">部署長</SelectItem>
                            <SelectItem value="employee">一般</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        ユーザーデータなし
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Individual Permissions Tab */}
        <TabsContent value="permissions">
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            {/* User List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">ユーザー選択</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0 ${
                        selectedUserId === u.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.name} />}
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {u.name?.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.department?.name || '-'}</p>
                      </div>
                      {u.permissions.length > 0 && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {u.permissions.length}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Permission Grid */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedUser ? `${selectedUser.name} のパーミッション` : 'ユーザーを選択してください'}
                </CardTitle>
                {selectedUser && (
                  <CardDescription>
                    ロール: <Badge variant={roleBadgeVariant[selectedUser.role] || 'outline'} className="ml-1">
                      {roleLabels[selectedUser.role]}
                    </Badge>
                    <span className="ml-3">付与済み: {selectedUser.permissions.length}件</span>
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {selectedUser ? (
                  <div className="space-y-6">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group}>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">{group}</h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {PERMISSIONS.filter((p) => p.group === group).map((perm) => {
                            const checked = selectedUser.permissions.includes(perm.key)
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                  checked ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                                } ${permSaving ? 'opacity-50 pointer-events-none' : ''}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => togglePermission(perm.key)}
                                  disabled={permSaving}
                                />
                                <div>
                                  <p className="text-sm font-medium">{perm.label}</p>
                                  <p className="text-xs text-muted-foreground">{perm.key}</p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <Key className="h-12 w-12 mb-3 opacity-50" />
                    <p>左のリストからユーザーを選択してください</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Role Change Confirmation Dialog */}
      <Dialog open={!!roleDialog} onOpenChange={() => setRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ロール変更の確認</DialogTitle>
            <DialogDescription>
              {roleDialog && (
                <>
                  <span className="font-semibold">{roleDialog.user.name}</span> のロールを
                  <Badge variant={roleBadgeVariant[roleDialog.user.role]} className="mx-1">
                    {roleLabels[roleDialog.user.role]}
                  </Badge>
                  から
                  <Badge variant={roleBadgeVariant[roleDialog.newRole]} className="mx-1">
                    {roleLabels[roleDialog.newRole]}
                  </Badge>
                  に変更しますか？
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={confirmRoleChange} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              変更する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
