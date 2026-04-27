'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, Calendar, User, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function ApprovalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [approval, setApproval] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const autoApproved = useRef(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('approvals')
        .select('*, report:reports(*, user:users(name, department:departments!users_department_id_fkey(name)), tasks:report_tasks(*)), requester:users!approvals_requester_id_fkey(name)')
        .eq('id', params.id)
        .single()
      setApproval(data)

      // 詳細を開いた時点で自動的に確認済みにする
      if (data && data.status === 'pending' && !autoApproved.current) {
        autoApproved.current = true
        try {
          const res = await fetch(`/api/approvals/${params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' }),
          })
          if (res.ok) {
            setApproval({ ...data, status: 'approved' })
            router.refresh()
          } else {
            const body = await res.json()
            console.error('Auto-approval failed:', body.error)
            setError(body.error || '確認処理に失敗しました')
          }
        } catch (e) {
          console.error('Auto-approval error:', e)
          setError('確認処理に失敗しました')
        }
      }
    }
    load()
  }, [params.id])

  if (!approval) return <div className="flex items-center justify-center py-12"><Clock className="h-6 w-6 animate-spin" /></div>

  const report = approval.report

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/approvals/pending"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />戻る</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">承認詳細</h1>
          <p className="text-sm text-muted-foreground">{approval.requester?.name}の日報</p>
        </div>
        <Badge variant="outline" className={approval.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700'}>
          {approval.status === 'approved' ? '承認済' : '承認待ち'}
        </Badge>
      </div>

      {approval.status === 'approved' && autoApproved.current && !error && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          承認済みとして記録しました
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

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
    </div>
  )
}
