import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, BarChart3, FileText, CheckCircle, Clock, Target } from 'lucide-react'
import Link from 'next/link'

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function getPrevMonth(year: number, month: number): string {
  if (month === 1) return formatMonth(year - 1, 12)
  return formatMonth(year, month - 1)
}

function getNextMonth(year: number, month: number): string {
  if (month === 12) return formatMonth(year + 1, 1)
  return formatMonth(year, month + 1)
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams
  const now = new Date()

  let year: number
  let month: number

  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split('-').map(Number)
    year = y
    month = m
  } else {
    year = now.getFullYear()
    month = now.getMonth() + 1
  }

  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = getDaysInMonth(year, month)
  const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const supabase = await createClient()
  const { data: reports } = await supabase
    .from('reports')
    .select('*, user:users(name, department_id, department:departments!users_department_id_fkey(name))')
    .gte('report_date', startOfMonth)
    .lte('report_date', endOfMonth)
    .order('report_date')

  const allReports = reports || []

  // KPI calculations
  const nonDraftReports = allReports.filter((r: any) => r.status !== 'draft')
  const totalSubmitted = nonDraftReports.length

  const approvedCount = allReports.filter((r: any) => r.status === 'approved').length
  const submittedCount = allReports.filter((r: any) => r.status === 'submitted').length
  const rateBase = approvedCount + submittedCount
  const approvalRate = rateBase > 0 ? Math.round((approvedCount / rateBase) * 100) : 0

  const reportsWithHours = allReports.filter((r: any) => r.work_hours != null && r.work_hours > 0)
  const avgWorkHours = reportsWithHours.length > 0
    ? (reportsWithHours.reduce((sum: number, r: any) => sum + (r.work_hours || 0), 0) / reportsWithHours.length).toFixed(1)
    : '0.0'

  const reportsWithProgress = allReports.filter((r: any) => r.progress_rate != null)
  const avgProgressRate = reportsWithProgress.length > 0
    ? Math.round(reportsWithProgress.reduce((sum: number, r: any) => sum + (r.progress_rate || 0), 0) / reportsWithProgress.length)
    : 0

  // Department breakdown
  const deptMap: Record<string, {
    name: string
    total: number
    approved: number
    totalWorkHours: number
    workHoursCount: number
  }> = {}

  for (const report of allReports as any[]) {
    const deptName = report.user?.department?.name || '未所属'
    const deptId = report.user?.department_id || 'none'

    if (!deptMap[deptId]) {
      deptMap[deptId] = {
        name: deptName,
        total: 0,
        approved: 0,
        totalWorkHours: 0,
        workHoursCount: 0,
      }
    }

    deptMap[deptId].total++
    if (report.status === 'approved') deptMap[deptId].approved++
    if (report.work_hours != null && report.work_hours > 0) {
      deptMap[deptId].totalWorkHours += report.work_hours
      deptMap[deptId].workHoursCount++
    }
  }

  const departments = Object.values(deptMap).sort((a, b) => b.total - a.total)

  const kpis = [
    {
      title: '総提出数',
      value: `${totalSubmitted}件`,
      icon: FileText,
      description: '下書きを除く',
    },
    {
      title: '承認率',
      value: `${approvalRate}%`,
      icon: CheckCircle,
      description: `${approvedCount}件承認 / ${rateBase}件`,
    },
    {
      title: '平均稼働時間',
      value: `${avgWorkHours}h`,
      icon: Clock,
      description: `${reportsWithHours.length}件の平均`,
    },
    {
      title: '平均進捗率',
      value: `${avgProgressRate}%`,
      icon: Target,
      description: `${reportsWithProgress.length}件の平均`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">月次レポート</h1>
          <p className="text-muted-foreground">
            {year}年{month}月の集計・分析
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/reports/monthly?month=${getPrevMonth(year, month)}`}>
            <Button variant="outline" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-lg font-semibold min-w-[140px] text-center">
            {year}年{month}月
          </span>
          <Link href={`/dashboard/reports/monthly?month=${getNextMonth(year, month)}`}>
            <Button variant="outline" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Department Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5" />
            部署別集計
          </CardTitle>
        </CardHeader>
        <CardContent>
          {departments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>部署名</TableHead>
                  <TableHead className="text-right">総提出数</TableHead>
                  <TableHead className="text-right">承認済</TableHead>
                  <TableHead className="text-right">平均稼働時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept) => {
                  const deptAvgHours = dept.workHoursCount > 0
                    ? (dept.totalWorkHours / dept.workHoursCount).toFixed(1)
                    : '-'
                  return (
                    <TableRow key={dept.name}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-right">{dept.total}件</TableCell>
                      <TableCell className="text-right text-green-600">{dept.approved}件</TableCell>
                      <TableCell className="text-right">{deptAvgHours === '-' ? '-' : `${deptAvgHours}h`}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">この月のレポートデータがありません</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
