import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, FileText } from 'lucide-react'
import Link from 'next/link'

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: '下書き', variant: 'outline' },
  submitted: { label: '提出済', variant: 'secondary' },
  approved: { label: '承認済', variant: 'default' },
  rejected: { label: '却下', variant: 'destructive' },
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const page = parseInt(params.page || '1')
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('reports')
    .select('*, user:users(name, department:departments!users_department_id_fkey(name))', { count: 'exact' })
    .order('report_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data: reports, count } = await query

  const totalPages = Math.ceil((count || 0) / limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">日報一覧</h1>
          <p className="text-muted-foreground">全{count || 0}件</p>
        </div>
        <Link href="/dashboard/reports/new">
          <Button><Plus className="mr-2 h-4 w-4" />日報作成</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/reports"><Badge variant={!params.status ? 'default' : 'outline'} className="cursor-pointer">全て</Badge></Link>
            {Object.entries(statusMap).map(([key, { label, variant }]) => (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports && reports.length > 0 ? reports.map((report: any) => {
                const st = statusMap[report.status] || statusMap.draft
                return (
                  <TableRow key={report.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell><Link href={`/dashboard/reports/${report.id}`} className="block font-medium">{report.report_date}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/reports/${report.id}`} className="block">{report.user?.name}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/reports/${report.id}`} className="block text-muted-foreground text-sm">{report.user?.department?.name}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/reports/${report.id}`} className="block">{report.title || '-'}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/reports/${report.id}`} className="block">{report.work_hours ? `${report.work_hours}h` : '-'}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/reports/${report.id}`} className="block">{report.progress_rate != null ? `${report.progress_rate}%` : '-'}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/reports/${report.id}`}><Badge variant={st.variant}>{st.label}</Badge></Link></TableCell>
                  </TableRow>
                )
              }) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
