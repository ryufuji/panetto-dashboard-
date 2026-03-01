'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function NewAnnouncementPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('general')
  const [isPinned, setIsPinned] = useState(false)

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

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー: ログインしてください')

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) throw new Error('ユーザー情報の取得に失敗しました')

      const { error } = await supabase.from('board_posts').insert({
        organization_id: profile.organization_id,
        created_by: user.id,
        title: title.trim(),
        content: content.trim(),
        category,
        is_important: category === 'important',
        is_pinned: isPinned,
        is_announcement: true,
      })

      if (error) throw error

      toast.success('お知らせを作成しました')
      router.push('/dashboard/portal/announcements')
    } catch (err: any) {
      toast.error(err.message || 'お知らせの作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/portal/announcements">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">お知らせ作成</h1>
          <p className="text-muted-foreground">新しいお知らせを投稿します</p>
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
              <Link href="/dashboard/portal/announcements">
                <Button type="button" variant="outline">キャンセル</Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />投稿中...</>
                ) : (
                  <><Megaphone className="mr-2 h-4 w-4" />お知らせを投稿</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
