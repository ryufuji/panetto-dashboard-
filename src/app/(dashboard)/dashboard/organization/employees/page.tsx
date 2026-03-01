'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Pencil, Loader2, Plus, Upload, Download } from 'lucide-react'
import { toast } from 'sonner'

const roleLabels: Record<string, string> = { admin: '管理者', manager: '部署長', employee: '一般' }

interface EditForm {
  employee_number: string
  position: string
  department_id: string
  office_id: string
  report_reviewer_id: string
}

export default function EmployeesPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [offices, setOffices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editUser, setEditUser] = useState<any>(null)
  const [editForm, setEditForm] = useState<EditForm>({ employee_number: '', position: '', department_id: '', office_id: '', report_reviewer_id: '' })
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', name: '', employee_number: '', position: '', department_id: '', office_id: '', role: 'employee', report_reviewer_id: '' })
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [csvResults, setCsvResults] = useState<{ email: string; success: boolean; error?: string }[] | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const [usersRes, deptsRes, officesRes] = await Promise.all([
      supabase.from('users').select('*, department:departments!users_department_id_fkey(name, manager_id), office:offices!users_office_id_fkey(name), report_reviewer:users!users_report_reviewer_id_fkey(id, name)').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').eq('is_active', true).order('order_index'),
      supabase.from('offices').select('id, name').eq('is_active', true).order('name'),
    ])

    if (usersRes.data) setUsers(usersRes.data)
    if (deptsRes.data) setDepartments(deptsRes.data)
    if (officesRes.data) setOffices(officesRes.data)

    if (authUser) {
      const me = usersRes.data?.find((u: any) => u.id === authUser.id)
      setIsAdmin(me?.role === 'admin')
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const openEdit = (u: any) => {
    setEditUser(u)
    setEditForm({
      employee_number: u.employee_number || '',
      position: u.position || '',
      department_id: u.department_id || '',
      office_id: u.office_id || '',
      report_reviewer_id: u.report_reviewer_id || '',
    })
  }

  const handleSave = async () => {
    if (!editUser) return
    setSaving(true)

    const res = await fetch('/api/organization/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: editUser.id,
        employee_number: editForm.employee_number,
        position: editForm.position,
        department_id: editForm.department_id,
        office_id: editForm.office_id,
        report_reviewer_id: editForm.report_reviewer_id,
      }),
    })
    const json = await res.json()

    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? { ...u, ...json.data } : u))
      )
      toast.success(`${editUser.name} の情報を更新しました`)
      setEditUser(null)
    } else {
      toast.error(json.error || '更新に失敗しました')
    }
    setSaving(false)
  }

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      toast.error('メールアドレス、パスワード、氏名は必須です')
      return
    }
    setSaving(true)
    const res = await fetch('/api/organization/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const json = await res.json()
    if (res.ok) {
      setUsers((prev) => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(`${createForm.name} を作成しました`)
      setShowCreate(false)
      setCreateForm({ email: '', password: '', name: '', employee_number: '', position: '', department_id: '', office_id: '', role: 'employee', report_reviewer_id: '' })
    } else {
      toast.error(json.error || '作成に失敗しました')
    }
    setSaving(false)
  }

  const downloadCsvTemplate = () => {
    const deptNames = departments.map((d: any) => d.name).join(' / ')
    const officeNames = offices.map((o: any) => o.name).join(' / ')
    const bom = '\uFEFF'
    const header = 'email,password,name,employee_number,position,department,office,role'
    const example1 = 'tanaka@example.com,Password123,田中太郎,EMP-001,課長,' +
      (departments[0]?.name || '営業部') + ',' +
      (offices[0]?.name || '東京本社') + ',employee'
    const example2 = 'suzuki@example.com,Password456,鈴木花子,EMP-002,,' +
      (departments[1]?.name || departments[0]?.name || '') + ',' +
      (offices[0]?.name || '') + ',manager'
    const notes = [
      '',
      '# --- 入力ガイド（この行以下は削除してください） ---',
      '# email: メールアドレス（必須）',
      '# password: パスワード 6文字以上（必須）',
      '# name: 氏名（必須）',
      '# employee_number: 社員番号（任意）',
      '# position: 役職（任意）',
      `# department: 部署名（任意） 選択肢: ${deptNames || 'なし'}`,
      `# office: 拠点名（任意） 選択肢: ${officeNames || 'なし'}`,
      '# role: ロール（任意） admin / manager / employee（デフォルト: employee）',
    ]
    const csv = bom + [header, example1, example2, ...notes].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'users_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    if (lines.length < 2) {
      toast.error('CSVにデータ行がありません')
      return
    }

    const header = lines[0].split(',').map((h) => h.trim())
    const emailIdx = header.indexOf('email')
    const passwordIdx = header.indexOf('password')
    const nameIdx = header.indexOf('name')

    if (emailIdx === -1 || passwordIdx === -1 || nameIdx === -1) {
      toast.error('CSVヘッダーに email, password, name が必要です')
      return
    }

    const deptMap = new Map(departments.map((d: any) => [d.name, d.id]))
    const officeMap = new Map(offices.map((o: any) => [o.name, o.id]))

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim())
      return {
        email: cols[emailIdx] || '',
        password: cols[passwordIdx] || '',
        name: cols[nameIdx] || '',
        employee_number: cols[header.indexOf('employee_number')] || '',
        position: cols[header.indexOf('position')] || '',
        department_id: deptMap.get(cols[header.indexOf('department')] || '') || '',
        office_id: officeMap.get(cols[header.indexOf('office')] || '') || '',
        role: cols[header.indexOf('role')] || 'employee',
      }
    })

    setSaving(true)
    setShowCsvImport(true)
    setCsvResults(null)

    const res = await fetch('/api/organization/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: rows }),
    })
    const json = await res.json()

    if (res.ok) {
      setCsvResults(json.results)
      toast.success(`${json.succeeded}件成功、${json.failed}件失敗`)
      fetchData()
    } else {
      toast.error(json.error || 'インポートに失敗しました')
    }
    setSaving(false)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">社員管理</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">社員管理</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadCsvTemplate}>
              <Download className="mr-2 h-4 w-4" />CSV雛形
            </Button>
            <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />CSVインポート
            </Button>
            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />新規作成
            </Button>
          </div>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>社員</TableHead>
                <TableHead>部署</TableHead>
                <TableHead>拠点</TableHead>
                <TableHead>役職</TableHead>
                <TableHead>権限</TableHead>
                <TableHead>社員番号</TableHead>
                <TableHead>確認者</TableHead>
                {isAdmin && <TableHead className="w-[60px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">{u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.name} />}<AvatarFallback className="text-xs bg-blue-100 text-blue-700">{u.name?.slice(0, 2)}</AvatarFallback></Avatar>
                      <div><p className="font-medium text-sm">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{u.department?.name || '-'}</TableCell>
                  <TableCell className="text-sm">{u.office?.name || '-'}</TableCell>
                  <TableCell className="text-sm">{u.position || '-'}</TableCell>
                  <TableCell><Badge variant={u.role === 'admin' ? 'default' : u.role === 'manager' ? 'secondary' : 'outline'}>{roleLabels[u.role] || u.role}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.employee_number || '-'}</TableCell>
                  <TableCell className="text-sm">{
                    u.report_reviewer ? u.report_reviewer.name :
                    u.department?.manager_id ? `(部署長)` : '-'
                  }</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />社員データなし
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CSV Import Results Dialog */}
      <Dialog open={showCsvImport} onOpenChange={() => { setShowCsvImport(false); setCsvResults(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>CSVインポート結果</DialogTitle>
            <DialogDescription>
              {csvResults
                ? `${csvResults.filter((r) => r.success).length}件成功 / ${csvResults.filter((r) => !r.success).length}件失敗`
                : 'インポート中...'
              }
            </DialogDescription>
          </DialogHeader>
          {!csvResults ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {csvResults.map((r, i) => (
                <div key={i} className={`flex items-center justify-between rounded px-3 py-2 text-sm ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className="truncate">{r.email}</span>
                  {r.success
                    ? <Badge variant="default" className="shrink-0">成功</Badge>
                    : <Badge variant="destructive" className="shrink-0">{r.error}</Badge>
                  }
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setShowCsvImport(false); setCsvResults(null) }}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={() => setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規社員の作成</DialogTitle>
            <DialogDescription>ログイン用のアカウントを含む社員情報を登録します</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>氏名 *</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="例: 田中太郎" />
              </div>
              <div className="space-y-2">
                <Label>メールアドレス *</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="例: tanaka@panetto.co.jp" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>パスワード *</Label>
                <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="6文字以上" />
              </div>
              <div className="space-y-2">
                <Label>ロール</Label>
                <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">一般</SelectItem>
                    <SelectItem value="manager">部署長</SelectItem>
                    <SelectItem value="admin">管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>社員番号</Label>
                <Input value={createForm.employee_number} onChange={(e) => setCreateForm({ ...createForm, employee_number: e.target.value })} placeholder="例: EMP-002" />
              </div>
              <div className="space-y-2">
                <Label>役職</Label>
                <Input value={createForm.position} onChange={(e) => setCreateForm({ ...createForm, position: e.target.value })} placeholder="例: 課長" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>部署</Label>
                <Select value={createForm.department_id} onValueChange={(v) => setCreateForm({ ...createForm, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="部署を選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未設定</SelectItem>
                    {departments.map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>拠点</Label>
                <Select value={createForm.office_id} onValueChange={(v) => setCreateForm({ ...createForm, office_id: v })}>
                  <SelectTrigger><SelectValue placeholder="拠点を選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未設定</SelectItem>
                    {offices.map((o: any) => (<SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>確認者</Label>
              <Select value={createForm.report_reviewer_id} onValueChange={(v) => setCreateForm({ ...createForm, report_reviewer_id: v })}>
                <SelectTrigger><SelectValue placeholder="確認者を選択" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">デフォルト（部署長）</SelectItem>
                  {users.map((u: any) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={saving}>キャンセル</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>社員情報の編集</DialogTitle>
            <DialogDescription>{editUser?.name}（{editUser?.email}）</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>社員番号</Label>
              <Input
                value={editForm.employee_number}
                onChange={(e) => setEditForm({ ...editForm, employee_number: e.target.value })}
                placeholder="例: EMP-001"
              />
            </div>
            <div className="space-y-2">
              <Label>役職</Label>
              <Input
                value={editForm.position}
                onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                placeholder="例: 課長"
              />
            </div>
            <div className="space-y-2">
              <Label>部署</Label>
              <Select value={editForm.department_id} onValueChange={(v) => setEditForm({ ...editForm, department_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="部署を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>拠点</Label>
              <Select value={editForm.office_id} onValueChange={(v) => setEditForm({ ...editForm, office_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="拠点を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {offices.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>確認者</Label>
              <Select value={editForm.report_reviewer_id} onValueChange={(v) => setEditForm({ ...editForm, report_reviewer_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="確認者を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">デフォルト（部署長）</SelectItem>
                  {users.filter((u: any) => u.id !== editUser?.id).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={saving}>キャンセル</Button>
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
