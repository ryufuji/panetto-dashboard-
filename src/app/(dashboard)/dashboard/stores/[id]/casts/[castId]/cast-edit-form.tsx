'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Pencil, Save, Trash2, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CastEditFormProps {
  cast: any
  storeId: string
}

export default function CastEditForm({ cast, storeId }: CastEditFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [name, setName] = useState(cast.name)
  const [stageName, setStageName] = useState(cast.stage_name || '')
  const [phone, setPhone] = useState(cast.phone || '')
  const [email, setEmail] = useState(cast.email || '')
  const [employmentType, setEmploymentType] = useState(cast.employment_type)
  const [hireDate, setHireDate] = useState(cast.hire_date || '')
  const [birthDate, setBirthDate] = useState(cast.birth_date || '')
  const [status, setStatus] = useState(cast.status)
  const [skills, setSkills] = useState(cast.skills?.join(', ') || '')
  const [notes, setNotes] = useState(cast.notes || '')

  const handleCancel = () => {
    setName(cast.name)
    setStageName(cast.stage_name || '')
    setPhone(cast.phone || '')
    setEmail(cast.email || '')
    setEmploymentType(cast.employment_type)
    setHireDate(cast.hire_date || '')
    setBirthDate(cast.birth_date || '')
    setStatus(cast.status)
    setSkills(cast.skills?.join(', ') || '')
    setNotes(cast.notes || '')
    setEditing(false)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('氏名は必須です')
      return
    }

    setLoading(true)
    try {
      const skillsArray = skills
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)

      const { error } = await supabase
        .from('casts')
        .update({
          name: name.trim(),
          stage_name: stageName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          employment_type: employmentType,
          hire_date: hireDate || null,
          birth_date: birthDate || null,
          status,
          skills: skillsArray.length > 0 ? skillsArray : null,
          notes: notes.trim() || null,
        })
        .eq('id', cast.id)

      if (error) throw error

      toast.success('キャスト情報を更新しました')
      setEditing(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || '更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('casts').delete().eq('id', cast.id)

      if (error) throw error

      toast.success('キャストを削除しました')
      router.push(`/dashboard/stores/${storeId}/casts`)
    } catch (err: any) {
      toast.error(err.message || '削除に失敗しました')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          編集
        </Button>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-red-600 hover:text-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
              削除
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>キャストを削除しますか？</DialogTitle>
              <DialogDescription>
                「{cast.stage_name || cast.name}」を削除します。この操作は取り消せません。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                キャンセル
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                削除する
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>情報を編集</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-name">
              氏名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-stageName">源氏名</Label>
            <Input
              id="edit-stageName"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-phone">電話番号</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">メールアドレス</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>雇用形態</Label>
            <Select value={employmentType} onValueChange={setEmploymentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">正社員</SelectItem>
                <SelectItem value="part_time">パート</SelectItem>
                <SelectItem value="temporary">臨時</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ステータス</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">在籍</SelectItem>
                <SelectItem value="inactive">休止</SelectItem>
                <SelectItem value="retired">退職</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-hireDate">入店日</Label>
            <Input
              id="edit-hireDate"
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-birthDate">生年月日</Label>
            <Input
              id="edit-birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-skills">スキル</Label>
          <Input
            id="edit-skills"
            placeholder="カンマ区切りで入力"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            カンマ（,）で区切って複数入力できます
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-notes">備考</Label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            <X className="mr-2 h-4 w-4" />
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存する
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
