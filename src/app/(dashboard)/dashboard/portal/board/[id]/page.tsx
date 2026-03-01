import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User, Calendar, Eye } from 'lucide-react'
import Link from 'next/link'

export default async function BoardPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: post } = await supabase.from('board_posts').select('*, creator:users(name)').eq('id', id).single()
  if (!post) notFound()

  // Increment view count
  await supabase.from('board_posts').update({ view_count: (post.view_count || 0) + 1 }).eq('id', id)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/portal/board"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />戻る</Button></Link>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            {post.category && <Badge variant="outline">{post.category}</Badge>}
            {post.is_important && <Badge variant="destructive">重要</Badge>}
          </div>
          <CardTitle className="text-2xl">{post.title}</CardTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><User className="h-4 w-4" />{(post.creator as any)?.name}</span>
            <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(post.created_at).toLocaleString('ja-JP')}</span>
            <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{post.view_count}回閲覧</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none whitespace-pre-wrap">{post.content}</div>
        </CardContent>
      </Card>
    </div>
  )
}
