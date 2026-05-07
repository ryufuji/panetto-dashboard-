'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface OverdueRow {
  id: string
  title: string
  due_date: string
  progress_rate: number
  task_status: string | null
  report_id: string
  report_date: string
  user_name?: string
}

export default function OverdueTasksPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OverdueRow[]>([])
  const [scope, setScope] = useState<'mine' | 'org'>('mine')
  const [statusFilter, setStatusFilter] = useState<'all' | 'incomplete' | 'in_progress'>('incomplete')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      if (!profile) return

      let reportsQuery = supabase
        .from('reports')
        .select('id, report_date, user_id, user:users(name)')
        .in('status', ['submitted', 'approved'])

      if (scope === 'mine') {
        reportsQuery = reportsQuery.eq('user_id', user.id)
      } else {
        reportsQuery = reportsQuery.eq('organization_id', (profile as any).organization_id)
      }

      const { data: reports } = await reportsQuery
      if (!reports || reports.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false) }
        return
      }

      const reportIds = reports.map((r: any) => r.id)
      const dateMap = new Map(reports.map((r: any) => [r.id, r.report_date]))
      const userMap = new Map(reports.map((r: any) => [r.id, r.user?.name || '']))

      const { data: tasks } = await supabase
        .from('report_tasks')
        .select('id, title, due_date, progress_rate, task_status, report_id')
        .in('report_id', reportIds)
        .lt('due_date', today)
        .lt('progress_rate', 100)
        .order('due_date', { ascending: true })
        .limit(200)

      if (!cancelled) {
        const enriched = (tasks || []).map((t: any) => ({
          ...t,
          report_date: dateMap.get(t.report_id) || '',
          user_name: userMap.get(t.report_id) || '',
        }))
        setRows(enriched)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  const filtered = rows.filter(t => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'in_progress') return t.task_status === '進行中'
    return t.task_status !== '完了'
  })

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-500" />期日遅れタスク
          </h1>
          <p className="text-muted-foreground">期日を過ぎた未完了のタスクを一覧表示します</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">フィルター</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={scope} onValueChange={(v: any) => setScope(v)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">自分のみ</SelectItem>
                <SelectItem value="org">組織全体</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="incomplete">未完了のみ</SelectItem>
                <SelectItem value="in_progress">進行中のみ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />読み込み中...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">期日遅れのタスクはありません</p>
          ) : (
            <ul className="divide-y">
              {filtered.map(t => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm gap-2">
                  <span className="text-red-600 tabular-nums w-24">{t.due_date}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  {scope === 'org' && t.user_name && (
                    <span className="text-xs text-muted-foreground w-24 truncate text-right">{t.user_name}</span>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{t.progress_rate}%</span>
                  {t.task_status && <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{t.task_status}</span>}
                  <Button asChild variant="link" size="sm" className="h-6 px-1 text-xs">
                    <a href={`/dashboard/reports/${t.report_id}`}>表示</a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
