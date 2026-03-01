'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function EditAnnouncementPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('general')
  const [isPinned, setIsPinned] = useState(false)

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/portal/board/${id}`)
        if (!res.ok) {
          toast.error('お知らせの取得に失敗しました')
          return
        }
        const { data } = await res.json()
        setTitle(data.title || '')
        setContent(data.content || '')
        setCategory(data.category || 'general')
        setIsPinned(!!data.is_pinned)
      } catch {
        toast.error('お知らせの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('タイトルを入力してください')
      return
    }
    if (!content.trim()) {
      toast.error('内容を入力してください')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/portal/board/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category,
          is_important: category === 'important',
          is_pinned: isPinned,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || '更新に失敗しました')
      }

      toast.success('お知らせを更新しました')
      router.push(`/dashboard/portal/announcements/${id}`)
    } catch (err: any) {
      toast.error(err.message || 'お知らせの更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/portal/announcements/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">お知らせ編集</h1>
          <p className="text-muted-foreground">お知らせの内容を編集します</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="title">タイトル <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                placeholder="お知らせのタイトルを入力..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">カテゴリ</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="カテゴリを選択..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">一般</SelectItem>
                  <SelectItem value="important">重要</SelectItem>
                  <SelectItem value="maintenance">メンテナンス</SelectItem>
                  <SelectItem value="event">イベント</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">内容 <span className="text-red-500">*</span></Label>
              <Textarea
                id="content"
                placeholder="お知らせの内容を入力..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isPinned"
                checked={isPinned}
                onCheckedChange={(v) => setIsPinned(!!v)}
              />
              <label htmlFor="isPinned" className="text-sm cursor-pointer">
                ピン留めする（一覧の上部に固定表示）
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Link href={`/dashboard/portal/announcements/${id}`}>
                <Button type="button" variant="outline">キャンセル</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />保存中...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" />保存</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
