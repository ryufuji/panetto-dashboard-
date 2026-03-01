import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Pin, AlertTriangle, MessageSquare, Eye } from 'lucide-react'
import Link from 'next/link'

export default async function BoardPage() {
  const supabase = await createClient()
  const { data: posts } = await supabase
    .from('board_posts')
    .select('*, creator:users(name)')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">掲示板</h1>
        <Link href="/dashboard/portal/board/new"><Button><Plus className="mr-2 h-4 w-4" />新規投稿</Button></Link>
      </div>
      <div className="space-y-3">
        {posts?.map((post: any) => (
          <Link key={post.id} href={`/dashboard/portal/board/${post.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {post.is_pinned && <Pin className="h-4 w-4 text-blue-500" />}
                      {post.is_important && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                      <h3 className="font-semibold">{post.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{post.creator?.name}</span>
                      <span>{new Date(post.created_at).toLocaleDateString('ja-JP')}</span>
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.view_count}</span>
                    </div>
                  </div>
                  {post.category && <Badge variant="outline">{post.category}</Badge>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(!posts || posts.length === 0) && <p className="text-center text-muted-foreground py-8">投稿はありません</p>}
      </div>
    </div>
  )
}
