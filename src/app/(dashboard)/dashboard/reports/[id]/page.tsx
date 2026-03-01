'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { ArrowLeft, Clock, User, Calendar, Target, Loader2, Send, Trash2, Pencil, ArrowUpRight, ClipboardCheck, ExternalLink, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: '下書き', variant: 'outline' },
  submitted: { label: '提出済', variant: 'secondary' },
  approved: { label: '承認済', variant: 'default' },
  rejected: { label: '却下', variant: 'destructive' },
}

const APPROVAL_STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-gray-50 text-gray-700' },
  pending: { label: '承認待ち', className: 'bg-orange-50 text-orange-700' },
  approved: { label: '承認済み', className: 'bg-green-50 text-green-700' },
  rejected: { label: '却下', className: 'bg-red-50 text-red-700' },
  cancelled: { label: '取消', className: 'bg-gray-50 text-gray-500' },
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [commentContent, setCommentContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sendingComment, setSendingComment] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${id}`)
      if (!res.ok) throw new Error('Failed to fetch report')
      const json = await res.json()
      setReport(json.data)
    } catch {
      toast.error('日報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)
    }
    getUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmitReport = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' }),
      })
      if (!res.ok) throw new Error('Failed to submit report')
      toast.success('日報を提出しました')
      await fetchReport()
    } catch {
      toast.error('日報の提出に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteReport = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete report')
      toast.success('日報を削除しました')
      router.push('/dashboard/reports')
    } catch {
      toast.error('日報の削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const handleSendComment = async () => {
    if (!commentContent.trim()) return
    setSendingComment(true)
    try {
      const res = await fetch(`/api/reports/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentContent.trim() }),
      })
      if (!res.ok) throw new Error('Failed to send comment')
      toast.success('コメントを送信しました')
      setCommentContent('')
      await fetchReport()
    } catch {
      toast.error('コメントの送信に失敗しました')
    } finally {
      setSendingComment(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        日報が見つかりません
      </div>
    )
  }

  const st = statusMap[report.status] || statusMap.draft
  const parentTasks = (report.tasks || []).filter((t: any) => !t.parent_task_id).sort((a: any, b: any) => a.order_index - b.order_index)
  const isAuthor = currentUserId === report.user_id

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reports"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />戻る</Button></Link>

        {report.status === 'draft' && isAuthor && (
          <>
            <Link href={`/dashboard/reports/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-1 h-4 w-4" />編集
              </Button>
            </Link>
            <Button size="sm" onClick={handleSubmitReport} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-1 h-4 w-4" />}
              提出
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-1 h-4 w-4" />削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>日報を削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    この操作は取り消せません。日報が完全に削除されます。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleDeleteReport} disabled={deleting}>
                    {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {report.status === 'rejected' && isAuthor && (
          <Link href={`/dashboard/reports/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1 h-4 w-4" />編集
            </Button>
          </Link>
        )}

        <div className="flex-1">
          <h1 className="text-2xl font-bold">{report.title || `${report.report_date}の日報`}</h1>
          <p className="text-sm text-muted-foreground">{(report.user as any)?.name} | {(report.user as any)?.department?.name}</p>
        </div>
        <Badge variant={st.variant} className="text-sm">{st.label}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Calendar className="h-5 w-5 text-blue-500" /><div><p className="text-xs text-muted-foreground">日付</p><p className="font-medium">{report.report_date}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Clock className="h-5 w-5 text-green-500" /><div><p className="text-xs text-muted-foreground">稼働時間</p><p className="font-medium">{report.work_hours ? `${report.work_hours}時間` : '-'}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Target className="h-5 w-5 text-purple-500" /><div><p className="text-xs text-muted-foreground">進捗率</p><p className="font-medium">{report.progress_rate != null ? `${report.progress_rate}%` : '-'}</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>タスク一覧</CardTitle></CardHeader>
        <CardContent>
          {parentTasks.length > 0 ? (
            <div className="space-y-4">
              {parentTasks.map((task: any) => {
                const children = (report.tasks || []).filter((t: any) => t.parent_task_id === task.id).sort((a: any, b: any) => a.order_index - b.order_index)
                return (
                  <div key={task.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">{task.title}</h3>
                      <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'low' ? 'outline' : 'secondary'}>
                        {task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '中'}
                      </Badge>
                    </div>
                    {task.description && <p className="text-sm text-muted-foreground mb-2">{task.description}</p>}
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>見積: {task.estimated_hours || '-'}h</span>
                      <span>実績: {task.actual_hours || '-'}h</span>
                      <span>進捗: {task.progress_rate}%</span>
                    </div>
                    {children.length > 0 && (
                      <div className="mt-3 ml-4 space-y-2 border-l pl-4">
                        {children.map((child: any) => (
                          <div key={child.id} className="rounded border border-dashed p-3">
                            <p className="font-medium text-sm">{child.title}</p>
                            <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                              <span>見積: {child.estimated_hours || '-'}h</span>
                              <span>実績: {child.actual_hours || '-'}h</span>
                              <span>進捗: {child.progress_rate}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {task.approval_request && (
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
                        <ClipboardCheck className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{task.approval_request.title}</span>
                            <Badge className={APPROVAL_STATUS_MAP[task.approval_request.status]?.className || ''}>
                              {APPROVAL_STATUS_MAP[task.approval_request.status]?.label || task.approval_request.status}
                            </Badge>
                          </div>
                          {task.approval_request.amount != null && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              金額: ¥{Number(task.approval_request.amount).toLocaleString()}
                            </p>
                          )}
                          {task.approval_request.file_url && (
                            <a href={task.approval_request.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5">
                              <Link2 className="h-3 w-3" />関連ファイル
                            </a>
                          )}
                        </div>
                        <Link href={`/dashboard/approval-requests/${task.approval_request.id}`}>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-3 w-3 mr-1" />申請詳細
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">タスクなし</p>
          )}
        </CardContent>
      </Card>

      {report.next_day_plan && (
        <Card>
          <CardHeader><CardTitle>翌日の予定</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap">{report.next_day_plan}</p></CardContent>
        </Card>
      )}

      {(report.comments || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle>コメント</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(report.comments as any[]).map((c: any) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{c.user?.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString('ja-JP')}</span>
                </div>
                <p className="text-sm">{c.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>コメントを追加</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              placeholder="コメントを入力..."
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button onClick={handleSendComment} disabled={sendingComment || !commentContent.trim()}>
                {sendingComment ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                コメント送信
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
