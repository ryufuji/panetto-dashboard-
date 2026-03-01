import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Megaphone, Plus } from 'lucide-react'
import Link from 'next/link'

export default async function AnnouncementsPage() {
  const supabase = await createClient()
  const { data: posts } = await supabase
    .from('board_posts')
    .select('*, creator:users(name)')
    .eq('is_important', true)
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">お知らせ</h1>
        <Link href="/dashboard/portal/board/new"><Button><Plus className="mr-2 h-4 w-4" />新規作成</Button></Link>
      </div>
      <div className="space-y-3">
        {posts?.map((post: any) => (
          <Link key={post.id} href={`/dashboard/portal/board/${post.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <h3 className="font-semibold">{post.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{post.content}</p>
                <p className="text-xs text-muted-foreground mt-2">{post.creator?.name} | {new Date(post.created_at).toLocaleDateString('ja-JP')}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(!posts || posts.length === 0) && (
          <Card><CardContent className="flex flex-col items-center py-12">
            <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
            <p>お知らせはありません</p>
          </CardContent></Card>
        )}
      </div>
    </div>
  )
}
