'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

export default function NewBoardPostPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [isImportant, setIsImportant] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー')
      const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single()

      const { error } = await supabase.from('board_posts').insert({
        organization_id: profile?.organization_id,
        created_by: user.id,
        title, content,
        category: category || null,
        is_important: isImportant,
        is_pinned: isPinned,
      })
      if (error) throw error
      toast.success('投稿しました')
      router.push('/dashboard/portal/board')
    } catch (err: any) {
      toast.error(err.message || '投稿に失敗しました')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">掲示板投稿</h1>
      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2"><Label>タイトル</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
            <div className="space-y-2"><Label>カテゴリ</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="お知らせ">お知らせ</SelectItem>
                  <SelectItem value="連絡事項">連絡事項</SelectItem>
                  <SelectItem value="共有">共有</SelectItem>
                  <SelectItem value="相談">相談</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>内容</Label><Textarea value={content} onChange={e => setContent(e.target.value)} rows={8} required /></div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={isImportant} onCheckedChange={(v) => setIsImportant(!!v)} />重要</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={isPinned} onCheckedChange={(v) => setIsPinned(!!v)} />ピン留め</label>
            </div>
            <Button type="submit" disabled={loading}><Send className="mr-2 h-4 w-4" />投稿</Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
