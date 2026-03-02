import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Calendar, CheckCircle2, ListTodo } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const statusLabelMap: Record<string, string> = {
  todo: '未着手',
  doing: '進行中',
  done: '完了',
  blocked: 'ブロック中',
}

const categoryLabelMap: Record<string, string> = {
  general: '一般',
  improvement: '改善',
  hq_request: '本部依頼',
  trouble: 'トラブル',
  routine: 'ルーティン',
}

const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  high: { label: '高', variant: 'destructive' },
  normal: { label: '中', variant: 'secondary' },
  low: { label: '低', variant: 'outline' },
}

export default async function StoreReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('store_daily_reports')
    .select('*')
    .eq('id', id)
    .single()

  if (!report) {
    notFound()
  }

  const { data: tasks } = await supabase
    .from('store_daily_report_tasks')
    .select('*')
    .eq('report_id', id)
    .order('synced_at', { ascending: true })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reports">
          <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />戻る</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{report.external_user_name}の日報</h1>
          <p className="text-sm text-muted-foreground">{report.external_user_name} | {report.store_name}</p>
        </div>
        <Badge variant="outline" className="border-orange-300 text-orange-600">タス軽</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">日付</p>
              <p className="font-medium">{report.report_date}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ListTodo className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">タスク数</p>
              <p className="font-medium">{report.task_count}件</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-purple-500" />
            <div>
              <p className="text-xs text-muted-foreground">完了数</p>
              <p className="font-medium">{report.completed_count}/{report.task_count}件</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>タスク一覧</CardTitle></CardHeader>
        <CardContent>
          {tasks && tasks.length > 0 ? (
            <div className="space-y-4">
              {tasks.map((task: any) => {
                const priority = priorityConfig[task.priority] || priorityConfig.normal
                return (
                  <div key={task.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{task.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {categoryLabelMap[task.category] || task.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={priority.variant}>{priority.label}</Badge>
                        <Badge variant={task.status === 'done' ? 'default' : task.status === 'blocked' ? 'destructive' : 'secondary'}>
                          {statusLabelMap[task.status] || task.status}
                        </Badge>
                      </div>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                    )}
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      {task.start_date && <span>開始: {task.start_date}</span>}
                      {task.due_date && <span>期限: {task.due_date}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">タスクなし</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
