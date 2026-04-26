import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import Link from 'next/link'

const statusColorMap: Record<string, { dot: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  approved: { dot: 'bg-green-500', variant: 'default' },
  submitted: { dot: 'bg-yellow-500', variant: 'secondary' },
  draft: { dot: 'bg-gray-400', variant: 'outline' },
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

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

// Get day of week for the 1st of the month (0=Mon, 6=Sun) using ISO convention
function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  // Convert from JS Sunday=0 to Monday=0
  return day === 0 ? 6 : day - 1
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams
  // JST基準の今日。サーバーがUTCで動くため+9hシフトしてからローカル日付として扱う。
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const now = new Date(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate())

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
    .select('id, report_date, status, title, user:users(name)')
    .gte('report_date', startOfMonth)
    .lte('report_date', endOfMonth)
    .order('report_date')

  // Group reports by day
  const reportsByDay: Record<number, typeof reports> = {}
  if (reports) {
    for (const report of reports) {
      const day = parseInt(report.report_date.split('-')[2], 10)
      if (!reportsByDay[day]) reportsByDay[day] = []
      reportsByDay[day]!.push(report)
    }
  }

  const totalReports = reports?.length || 0
  const firstDayOfWeek = getFirstDayOfWeek(year, month)
  const totalCells = firstDayOfWeek + daysInMonth
  const totalRows = Math.ceil(totalCells / 7)

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">カレンダービュー</h1>
          <p className="text-muted-foreground">
            {year}年{month}月の日報 - 全{totalReports}件
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/reports/calendar?month=${getPrevMonth(year, month)}`}>
            <Button variant="outline" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="text-lg font-semibold min-w-[140px] text-center">
            {year}年{month}月
          </span>
          <Link href={`/dashboard/reports/calendar?month=${getNextMonth(year, month)}`}>
            <Button variant="outline" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5" />
            月間カレンダー
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Day of week header */}
          <div className="grid grid-cols-7 border-b">
            {DAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`py-2 text-center text-sm font-medium ${
                  i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-600' : 'text-foreground'
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-l">
            {Array.from({ length: totalRows * 7 }, (_, cellIndex) => {
              const dayNum = cellIndex - firstDayOfWeek + 1
              const isValidDay = dayNum >= 1 && dayNum <= daysInMonth
              const dayReports = isValidDay ? reportsByDay[dayNum] || [] : []
              const dateStr = isValidDay
                ? `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                : ''
              const isToday = dateStr === todayStr
              const dayOfWeek = cellIndex % 7 // 0=Mon, 5=Sat, 6=Sun

              return (
                <div
                  key={cellIndex}
                  className={`min-h-[100px] border-r border-b p-1.5 ${
                    isToday ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                  } ${!isValidDay ? 'bg-muted/30' : ''}`}
                >
                  {isValidDay && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${
                            isToday
                              ? 'bg-primary text-primary-foreground'
                              : dayOfWeek === 5
                                ? 'text-blue-600'
                                : dayOfWeek === 6
                                  ? 'text-red-600'
                                  : ''
                          }`}
                        >
                          {dayNum}
                        </span>
                        {dayReports.length > 0 && (
                          <span className="text-xs text-muted-foreground">{dayReports.length}件</span>
                        )}
                      </div>
                      {dayReports.length > 0 ? (
                        <Link
                          href={`/dashboard/reports?page=1&date=${dateStr}`}
                          className="block space-y-0.5"
                        >
                          {dayReports.slice(0, 3).map((report: any) => {
                            const statusInfo = statusColorMap[report.status] || statusColorMap.draft
                            return (
                              <div
                                key={report.id}
                                className="flex items-center gap-1 text-xs truncate hover:bg-accent rounded px-1 py-0.5"
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${statusInfo.dot}`} />
                                <span className="truncate">
                                  {report.user?.name || report.title || '日報'}
                                </span>
                              </div>
                            )
                          })}
                          {dayReports.length > 3 && (
                            <div className="text-xs text-muted-foreground px-1">
                              +{dayReports.length - 3}件
                            </div>
                          )}
                        </Link>
                      ) : null}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t">
            <span className="text-xs text-muted-foreground">ステータス:</span>
            {Object.entries(statusColorMap).map(([status, { dot }]) => {
              const labelMap: Record<string, string> = {
                approved: '承認済',
                submitted: '提出済',
                draft: '下書き',
              }
              return (
                <div key={status} className="flex items-center gap-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                  <span className="text-xs">{labelMap[status]}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
