'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function NewCastPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [stageName, setStageName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [employmentType, setEmploymentType] = useState<string>('')
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0])
  const [birthDate, setBirthDate] = useState('')
  const [skills, setSkills] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('氏名は必須です')
      return
    }

    setLoading(true)
    try {
      const skillsArray = skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const { error } = await supabase.from('casts').insert({
        store_id: id,
        name: name.trim(),
        stage_name: stageName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        employment_type: employmentType || 'part_time',
        hire_date: hireDate || null,
        birth_date: birthDate || null,
        skills: skillsArray.length > 0 ? skillsArray : null,
        notes: notes.trim() || null,
        status: 'active',
      })

      if (error) throw error

      toast.success('キャストを登録しました')
      router.push(`/dashboard/stores/${id}/casts`)
    } catch (err: any) {
      toast.error(err.message || '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/stores/${id}/casts`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">キャスト新規登録</h1>
          <p className="text-sm text-muted-foreground">
            新しいキャスト情報を入力してください
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  氏名 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="山田 花子"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stageName">源氏名</Label>
                <Input
                  id="stageName"
                  placeholder="はなこ"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">電話番号</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="090-1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>雇用形態</Label>
                <Select value={employmentType} onValueChange={setEmploymentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">正社員</SelectItem>
                    <SelectItem value="part_time">パート</SelectItem>
                    <SelectItem value="temporary">臨時</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hireDate">入店日</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">生年月日</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="skills">スキル</Label>
              <Input
                id="skills"
                placeholder="接客, ドリンク作成, 会計（カンマ区切り）"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                カンマ（,）で区切って複数入力できます
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                placeholder="特記事項があれば入力..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Link href={`/dashboard/stores/${id}/casts`}>
            <Button variant="outline" type="button">
              キャンセル
            </Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            登録する
          </Button>
        </div>
      </form>
    </div>
  )
}
