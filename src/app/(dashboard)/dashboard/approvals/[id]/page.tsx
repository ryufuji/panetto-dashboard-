'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Check, X, Clock, Calendar, User } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ApprovalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [approval, setApproval] = useState<any>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('approvals')
        .select('*, report:reports(*, user:users(name, department:departments!users_department_id_fkey(name)), tasks:report_tasks(*)), requester:users!approvals_requester_id_fkey(name)')
        .eq('id', params.id)
        .single()
      setApproval(data)
    }
    load()
  }, [params.id])

  const handleAction = async (status: 'approved' | 'rejected') => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      await supabase.from('approvals').update({
        status,
        comment: comment || null,
        responded_at: new Date().toISOString(),
      }).eq('id', params.id)

      await supabase.from('reports').update({
        status,
      }).eq('id', approval.report_id)

      await supabase.from('approval_history').insert({
        approval_id: params.id as string,
        user_id: user?.id || '',
        action: status === 'approved' ? 'approve' : 'reject',
        comment: comment || null,
        previous_status: 'pending',
        new_status: status,
      })

      toast.success(status === 'approved' ? '確認しました' : '却下しました')
      router.push('/dashboard/approvals/pending')
    } catch (err: any) {
      toast.error(err.message || '処理に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (!approval) return <div className="flex items-center justify-center py-12"><Clock className="h-6 w-6 animate-spin" /></div>

  const report = approval.report

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/approvals/pending"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />戻る</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">確認詳細</h1>
          <p className="text-sm text-muted-foreground">{approval.requester?.name}の日報</p>
        </div>
        <Badge variant="outline" className="bg-orange-50 text-orange-700">{
          approval.status === 'pending' ? '確認待ち' : approval.status === 'approved' ? '確認済' : '却下'
        }</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <User className="h-5 w-5 text-blue-500" /><div><p className="text-xs text-muted-foreground">申請者</p><p className="font-medium">{approval.requester?.name}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Calendar className="h-5 w-5 text-green-500" /><div><p className="text-xs text-muted-foreground">日報日付</p><p className="font-medium">{report?.report_date}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Clock className="h-5 w-5 text-purple-500" /><div><p className="text-xs text-muted-foreground">稼働時間</p><p className="font-medium">{report?.work_hours ? `${report.work_hours}h` : '-'}</p></div>
        </CardContent></Card>
      </div>

      {report?.tasks && report.tasks.length > 0 && (
        <Card>
          <CardHeader><CardTitle>タスク</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {report.tasks.filter((t: any) => !t.parent_task_id).map((task: any) => (
              <div key={task.id} className="rounded-lg border p-3">
                <p className="font-medium">{task.title}</p>
                <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                  <span>見積: {task.estimated_hours || '-'}h</span>
                  <span>実績: {task.actual_hours || '-'}h</span>
                  <span>進捗: {task.progress_rate}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {report?.next_day_plan && (
        <Card>
          <CardHeader><CardTitle>翌日の予定</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap">{report.next_day_plan}</p></CardContent>
        </Card>
      )}

      {approval.status === 'pending' && (
        <Card>
          <CardHeader><CardTitle>確認アクション</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>コメント（任意）</Label>
              <Textarea placeholder="コメントを入力..." value={comment} onChange={e => setComment(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => handleAction('approved')} disabled={loading} className="bg-green-600 hover:bg-green-700">
                <Check className="mr-2 h-4 w-4" />確認
              </Button>
              <Button variant="destructive" onClick={() => handleAction('rejected')} disabled={loading}>
                <X className="mr-2 h-4 w-4" />却下
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
