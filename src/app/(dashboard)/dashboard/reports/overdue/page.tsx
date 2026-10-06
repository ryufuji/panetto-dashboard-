'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchOverdueTasks, STALE_DAYS, type OverdueScope, type OverdueTask } from '@/lib/overdue-tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Loader2, Plus } from 'lucide-react'
import { OverdueGuidance } from '@/components/reports/OverdueGuidance'

export default function OverdueTasksPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OverdueTask[]>([])
  const [scope, setScope] = useState<'mine' | 'org'>('mine')
  const [statusFilter, setStatusFilter] = useState<'all' | 'incomplete' | 'in_progress'>('incomplete')
  const [loadError, setLoadError] = useState<string | null>(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('ログイン情報を取得できませんでした。再度ログインしてください')

        const { data: profile } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single()
        if (!profile) throw new Error('ユーザー情報を取得できませんでした。管理者にお問い合わせください')

        const target: OverdueScope = scope === 'mine'
          ? { kind: 'user', userId: user.id }
          : { kind: 'org', organizationId: (profile as any).organization_id }

        // 進捗が止まっているタスクは本人の画面にだけ出す。
        // 組織全体の一覧は、管理側から見える件数が増えないよう期日超過のみに保つ。
        const rows = await fetchOverdueTasks(supabase, target, today, scope === 'mine')

        if (!cancelled) setRows(rows)
      } catch (e: any) {
        if (!cancelled) {
          setRows([])
          setLoadError(e?.message || '期日遅れタスクを取得できませんでした。時間をおいて再読み込みしてください')
        }
      } finally {
        if (!cancelled) setLoading(false)
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
  const overdueCount = filtered.filter(t => t.is_overdue).length
  const staleOnlyCount = filtered.filter(t => !t.is_overdue && t.is_stale).length

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-500" />期日遅れタスク
          </h1>
          <p className="text-muted-foreground">
            {scope === 'mine'
              ? `期日を過ぎた未完了のタスクと、${STALE_DAYS}日以上進捗が動いていないタスクを一覧表示します。同じタスクは最新の日報の状態で判定します`
              : '期日を過ぎた未完了のタスクを一覧表示します。同じタスクは最新の日報の状態で判定します'}
          </p>
        </div>
        <Button asChild size="sm">
          <a href="/dashboard/reports/new"><Plus className="mr-1 h-4 w-4" />日報を作成して取り込む</a>
        </Button>
      </div>

      <OverdueGuidance showStale={scope === 'mine'} staleDays={STALE_DAYS} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">
            フィルター
            {!loading && !loadError && filtered.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {overdueCount > 0 && `期日超過 ${overdueCount}件`}
                {overdueCount > 0 && staleOnlyCount > 0 && ' / '}
                {staleOnlyCount > 0 && `進捗が止まっている ${staleOnlyCount}件`}
              </span>
            )}
          </CardTitle>
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
          ) : loadError ? (
            <p className="text-sm text-red-600 py-8 text-center">{loadError}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">期日遅れのタスクはありません</p>
          ) : (
            <ul className="divide-y">
              {filtered.map(t => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                  <span className={`tabular-nums w-24 shrink-0 ${t.is_overdue ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {t.due_date || '期日なし'}
                  </span>
                  <span className="order-1 w-full min-w-0 truncate sm:order-none sm:w-auto sm:flex-1">{t.title}</span>
                  {scope === 'mine' && t.is_stale && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                      {t.stale_days}日 進捗なし
                    </span>
                  )}
                  {scope === 'org' && t.user_name && (
                    <span className="shrink-0 text-xs text-muted-foreground w-24 truncate text-right">{t.user_name}</span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums w-12 text-right">{t.progress_rate}%</span>
                  {t.task_status && <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{t.task_status}</span>}
                  <Button asChild variant="link" size="sm" className="h-6 px-1 text-xs shrink-0 ml-auto sm:ml-0">
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
