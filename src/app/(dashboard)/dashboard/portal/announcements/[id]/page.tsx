'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User, Calendar, Pin, Pencil, Trash2, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import Link from 'next/link'

const categoryLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  general: { label: '一般', variant: 'secondary' },
  important: { label: '重要', variant: 'destructive' },
  maintenance: { label: 'メンテナンス', variant: 'outline' },
  event: { label: 'イベント', variant: 'default' },
}

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [isAuthor, setIsAuthor] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [postRes, authRes] = await Promise.all([
          fetch(`/api/portal/board/${id}`),
          supabase.auth.getUser(),
        ])

        if (!postRes.ok) {
          toast.error('お知らせの取得に失敗しました')
          return
        }

        const { data } = await postRes.json()
        setPost(data)

        const user = authRes.data.user
        if (user && data.created_by === user.id) {
          setIsAuthor(true)
        }
      } catch {
        toast.error('お知らせの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/portal/board/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || '削除に失敗しました')
      }
      toast.success('お知らせを削除しました')
      router.push('/dashboard/portal/announcements')
    } catch (err: any) {
      toast.error(err.message || 'お知らせの削除に失敗しました')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/portal/announcements">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />戻る
            </Button>
          </Link>
        </div>
        <p className="text-muted-foreground">お知らせが見つかりませんでした。</p>
      </div>
    )
  }

  const cat = categoryLabels[post.category] || categoryLabels.general

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/portal/announcements">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div className="flex-1" />
        {isAuthor && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/portal/announcements/${id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />編集
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={deleting}
                >
                  {deleting ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" />削除中...</>
                  ) : (
                    <><Trash2 className="mr-1 h-4 w-4" />削除</>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>お知らせを削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は取り消せません。このお知らせは完全に削除されます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleDelete}>
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant={cat.variant}>{cat.label}</Badge>
            {post.is_pinned && (
              <Badge variant="outline" className="gap-1">
                <Pin className="h-3 w-3" />ピン留め
              </Badge>
            )}
            {post.is_important && (
              <Badge variant="destructive">重要</Badge>
            )}
          </div>
          <CardTitle className="text-2xl">{post.title}</CardTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {post.user?.name || '不明'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(post.created_at).toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {post.content}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
