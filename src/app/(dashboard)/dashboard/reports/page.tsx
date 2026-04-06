import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, FileText, Eye } from 'lucide-react'
import Link from 'next/link'
import { SyncTasukaruButton } from '@/components/reports/sync-tasukaru-button'

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: '下書き', variant: 'outline' },
  submitted: { label: '提出済', variant: 'secondary' },
  approved: { label: '承認済', variant: 'default' },
}

type MergedRow = {
  id: string
  report_date: string
  author_name: string
  department_or_store: string
  title: string
  status_label: string
  status_variant: 'default' | 'secondary' | 'destructive' | 'outline'
  progress: string
  work_hours: string
  href: string
  source: 'internal' | 'store'
  view_count: number
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const page = parseInt(params.page || '1')
  const limit = 20
  const offset = (page - 1) * limit

  // Fetch only enough rows to render the current page after merging.
  // We over-fetch by `offset+limit` from each source so the merged+sorted slice is correct.
  const fetchCap = offset + limit

  let reportsQuery = supabase
    .from('reports')
    .select('id, report_date, title, status, progress_rate, work_hours, user:users(name, department:departments!users_department_id_fkey(name))', { count: 'exact' })
    .order('report_date', { ascending: false })
    .limit(fetchCap)

  if (params.status) {
    reportsQuery = reportsQuery.eq('status', params.status)
  }

  const storeReportsPromise = params.status
    ? Promise.resolve({ data: [] as any[], count: 0 })
    : supabase
        .from('store_daily_reports')
        .select('id, report_date, external_user_name, store_name, task_count, completed_count', { count: 'exact' })
        .order('report_date', { ascending: false })
        .limit(fetchCap)

  const [reportsRes, storeReportsRes] = await Promise.all([reportsQuery, storeReportsPromise])
  const reports = reportsRes.data
  const reportsCount = reportsRes.count || 0
  const storeReports = storeReportsRes.data || []
  const storeReportsCount = storeReportsRes.count || 0

  // Fetch view counts for internal reports
  const reportIds = (reports || []).map((r: any) => r.id)
  const viewCountMap = new Map<string, number>()
  if (reportIds.length > 0) {
    const { data: viewData } = await supabase
      .from('report_views')
      .select('report_id')
      .in('report_id', reportIds)
    if (viewData) {
      for (const v of viewData) {
        viewCountMap.set(v.report_id, (viewCountMap.get(v.report_id) || 0) + 1)
      }
    }
  }

  // Merge and sort
  const merged: MergedRow[] = []

  for (const r of (reports || [])) {
    const st = statusMap[r.status] || statusMap.draft
    merged.push({
      id: r.id,
      report_date: r.report_date,
      author_name: (r as any).user?.name || '-',
      department_or_store: (r as any).user?.department?.name || '-',
      title: r.title || '-',
      status_label: st.label,
      status_variant: st.variant,
      progress: r.progress_rate != null ? `${r.progress_rate}%` : '-',
      work_hours: r.work_hours ? `${r.work_hours}h` : '-',
      href: `/dashboard/reports/${r.id}`,
      source: 'internal',
      view_count: viewCountMap.get(r.id) || 0,
    })
  }

  for (const sr of storeReports) {
    merged.push({
      id: sr.id,
      report_date: sr.report_date,
      author_name: sr.external_user_name,
      department_or_store: sr.store_name,
      title: `${sr.external_user_name}の日報`,
      status_label: `${sr.completed_count}/${sr.task_count}件完了`,
      status_variant: sr.completed_count === sr.task_count && sr.task_count > 0 ? 'default' : 'secondary',
      progress: sr.task_count > 0 ? `${Math.round((sr.completed_count / sr.task_count) * 100)}%` : '-',
      work_hours: '-',
      href: `/dashboard/reports/store/${sr.id}`,
      source: 'store',
      view_count: 0,
    })
  }

  // Sort by report_date descending
  merged.sort((a, b) => b.report_date.localeCompare(a.report_date))

  // Total count comes from DB count() (not the over-fetched merged list)
  const totalCount = reportsCount + storeReportsCount
  const paginated = merged.slice(offset, offset + limit)
  const totalPages = Math.ceil(totalCount / limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">日報一覧</h1>
          <p className="text-muted-foreground">全{totalCount}件</p>
        </div>
        <div className="flex gap-2">
          <SyncTasukaruButton />
          <Link href="/dashboard/reports/new">
            <Button><Plus className="mr-2 h-4 w-4" />日報作成</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/reports"><Badge variant={!params.status ? 'default' : 'outline'} className="cursor-pointer">全て</Badge></Link>
            {Object.entries(statusMap).map(([key, { label }]) => (
              <Link key={key} href={`/dashboard/reports?status=${key}`}>
                <Badge variant={params.status === key ? 'default' : 'outline'} className="cursor-pointer">{label}</Badge>
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>作成者</TableHead>
                <TableHead>部署</TableHead>
                <TableHead>タイトル</TableHead>
                <TableHead>稼働時間</TableHead>
                <TableHead>進捗</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>確認</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length > 0 ? paginated.map((row) => (
                <TableRow key={`${row.source}-${row.id}`} className="cursor-pointer hover:bg-gray-50">
                  <TableCell>
                    <Link href={row.href} className="block font-medium">
                      {row.report_date}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={row.href} className="flex items-center gap-2">
                      {row.author_name}
                      {row.source === 'store' && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-300 text-orange-600">タス軽</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell><Link href={row.href} className="block text-muted-foreground text-sm">{row.department_or_store}</Link></TableCell>
                  <TableCell><Link href={row.href} className="block">{row.title}</Link></TableCell>
                  <TableCell><Link href={row.href} className="block">{row.work_hours}</Link></TableCell>
                  <TableCell><Link href={row.href} className="block">{row.progress}</Link></TableCell>
                  <TableCell>
                    <Link href={row.href}>
                      <Badge variant={row.status_variant}>{row.status_label}</Badge>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={row.href}>
                      {row.view_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                          <Eye className="h-3.5 w-3.5" />
                          {row.view_count}人
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </Link>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    日報データがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: totalPages }, (_, i) => (
                <Link key={i} href={`/dashboard/reports?page=${i + 1}${params.status ? `&status=${params.status}` : ''}`}>
                  <Button variant={page === i + 1 ? 'default' : 'outline'} size="sm">{i + 1}</Button>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
