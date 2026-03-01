import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, GitBranch, CalendarDays } from 'lucide-react'
import Link from 'next/link'

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function formatDateHeader(date: Date): { day: string; weekday: string; isWeekend: boolean } {
  return {
    day: String(date.getDate()),
    weekday: DAY_NAMES[date.getDay()],
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function getTaskColor(progressRate: number): { bg: string; fill: string; label: string } {
  if (progressRate >= 100) {
    return { bg: 'bg-green-100', fill: 'bg-green-500', label: '完了' }
  }
  if (progressRate > 0) {
    return { bg: 'bg-blue-100', fill: 'bg-blue-500', label: '進行中' }
  }
  return { bg: 'bg-gray-100', fill: 'bg-gray-300', label: '未着手' }
}

export default async function GanttPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams
  const days = Math.min(Math.max(parseInt(params.days || '30') || 30, 7), 90)
  const supabase = await createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - (days - 1))

  const endDateStr = toDateString(today)
  const startDateStr = toDateString(startDate)

  // Build the array of dates for the timeline
  const dateColumns: Date[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    dateColumns.push(d)
  }

  // Fetch reports in the date range with user info
  const { data: reports } = await supabase
    .from('reports')
    .select('id, report_date, title, user:users(name)')
    .gte('report_date', startDateStr)
    .lte('report_date', endDateStr)
    .order('report_date', { ascending: true })

  // Collect report IDs and fetch tasks
  const reportIds = (reports || []).map((r: any) => r.id)

  let tasks: any[] = []
  if (reportIds.length > 0) {
    const { data: taskData } = await supabase
      .from('report_tasks')
      .select('*')
      .in('report_id', reportIds)
      .order('order_index', { ascending: true })
    tasks = taskData || []
  }

  // Build a lookup from report_id to report info
  const reportMap = new Map<string, any>()
  for (const r of (reports || []) as any[]) {
    reportMap.set(r.id, r)
  }

  // Group tasks by report, maintaining report date order
  // Use an ordered structure: array of { report, tasks[] }
  const reportOrder: string[] = []
  const reportTaskGroups = new Map<string, any[]>()

  for (const r of (reports || []) as any[]) {
    if (!reportTaskGroups.has(r.id)) {
      reportTaskGroups.set(r.id, [])
      reportOrder.push(r.id)
    }
  }

  for (const task of tasks) {
    const group = reportTaskGroups.get(task.report_id)
    if (group) {
      // Only include top-level tasks (no parent)
      if (!task.parent_task_id) {
        group.push(task)
      }
    }
  }

  // Filter out reports with no tasks
  const groupedReports = reportOrder
    .filter((id) => (reportTaskGroups.get(id) || []).length > 0)
    .map((id) => ({
      report: reportMap.get(id),
      tasks: reportTaskGroups.get(id) || [],
    }))

  const totalTasks = groupedReports.reduce((sum, g) => sum + g.tasks.length, 0)

  // Calculate column width based on day count
  const colWidth = days <= 14 ? 48 : days <= 30 ? 40 : 32

  // Determine month boundaries for header
  const months: { label: string; span: number; startIdx: number }[] = []
  let currentMonth = -1
  for (let i = 0; i < dateColumns.length; i++) {
    const m = dateColumns[i].getMonth()
    if (m !== currentMonth) {
      months.push({
        label: `${dateColumns[i].getFullYear()}/${m + 1}月`,
        span: 1,
        startIdx: i,
      })
      currentMonth = m
    } else {
      months[months.length - 1].span++
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ガントチャート</h1>
          <p className="text-muted-foreground">
            {startDateStr} ~ {endDateStr}（{days}日間）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/reports/gantt?days=7`}>
            <Button variant={days === 7 ? 'default' : 'outline'} size="sm">1週間</Button>
          </Link>
          <Link href={`/dashboard/reports/gantt?days=14`}>
            <Button variant={days === 14 ? 'default' : 'outline'} size="sm">2週間</Button>
          </Link>
          <Link href={`/dashboard/reports/gantt?days=30`}>
            <Button variant={days === 30 ? 'default' : 'outline'} size="sm">30日</Button>
          </Link>
          <Link href={`/dashboard/reports/gantt?days=60`}>
            <Button variant={days === 60 ? 'default' : 'outline'} size="sm">60日</Button>
          </Link>
          <Link href="/dashboard/reports">
            <Button variant="outline" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" />一覧に戻る
            </Button>
          </Link>
        </div>
      </div>

      {totalTasks === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <GitBranch className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">タスクデータがありません</p>
            <p className="text-sm text-muted-foreground mt-1">
              選択した期間（{startDateStr} ~ {endDateStr}）に日報タスクが見つかりませんでした
            </p>
            <Link href="/dashboard/reports/new" className="mt-4">
              <Button variant="outline" size="sm">日報を作成する</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                タスクタイムライン
              </CardTitle>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-green-500" />
                  完了
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" />
                  進行中
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-gray-300" />
                  未着手
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex">
              {/* Fixed left column: task names */}
              <div className="flex-shrink-0 border-r bg-background z-10" style={{ width: 220 }}>
                {/* Month header spacer */}
                <div className="h-7 border-b bg-muted/30" />
                {/* Day header spacer */}
                <div className="h-10 border-b bg-muted/50 flex items-center px-3">
                  <span className="text-xs font-medium text-muted-foreground">タスク名</span>
                </div>
                {/* Task rows */}
                {groupedReports.map((group, groupIdx) => (
                  <div key={group.report.id}>
                    {/* Report section header */}
                    <div className="h-8 border-b bg-muted/20 flex items-center px-3 gap-2">
                      <CalendarDays className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <Link
                        href={`/dashboard/reports/${group.report.id}`}
                        className="text-xs font-semibold text-foreground truncate hover:underline"
                        title={group.report.title || group.report.report_date}
                      >
                        {truncate(group.report.title || group.report.report_date, 24)}
                      </Link>
                    </div>
                    {group.tasks.map((task: any, taskIdx: number) => (
                      <div
                        key={task.id}
                        className="h-10 border-b flex items-center px-3 pl-5 gap-2 hover:bg-muted/10"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate leading-tight" title={task.title}>
                            {truncate(task.title, 20)}
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-tight truncate">
                            {(group.report.user as any)?.name || '---'}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                          {task.progress_rate}%
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Scrollable right side: timeline */}
              <div className="flex-1 overflow-x-auto">
                <div style={{ minWidth: dateColumns.length * colWidth }}>
                  {/* Month header row */}
                  <div className="flex h-7 border-b bg-muted/30">
                    {months.map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-center text-[10px] font-medium text-muted-foreground border-r last:border-r-0"
                        style={{ width: m.span * colWidth }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>

                  {/* Day header row */}
                  <div className="flex h-10 border-b bg-muted/50">
                    {dateColumns.map((date, idx) => {
                      const info = formatDateHeader(date)
                      const isToday = isSameDay(date, today)
                      return (
                        <div
                          key={idx}
                          className={`flex flex-col items-center justify-center border-r last:border-r-0 ${
                            isToday
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : info.isWeekend
                                ? 'bg-muted/30'
                                : ''
                          }`}
                          style={{ width: colWidth }}
                        >
                          <span
                            className={`text-[10px] leading-tight ${
                              isToday
                                ? 'font-bold text-blue-600 dark:text-blue-400'
                                : info.isWeekend
                                  ? 'text-muted-foreground/70'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {info.weekday}
                          </span>
                          <span
                            className={`text-xs leading-tight ${
                              isToday
                                ? 'font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 rounded-full w-5 h-5 flex items-center justify-center'
                                : info.isWeekend
                                  ? 'text-muted-foreground/70'
                                  : 'text-foreground'
                            }`}
                          >
                            {info.day}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Task rows */}
                  {groupedReports.map((group) => (
                    <div key={group.report.id}>
                      {/* Report section header row */}
                      <div className="flex h-8 border-b bg-muted/20">
                        {dateColumns.map((date, idx) => {
                          const isToday = isSameDay(date, today)
                          const info = formatDateHeader(date)
                          return (
                            <div
                              key={idx}
                              className={`border-r last:border-r-0 ${
                                isToday
                                  ? 'bg-blue-50/50 dark:bg-blue-950/20'
                                  : info.isWeekend
                                    ? 'bg-muted/10'
                                    : ''
                              }`}
                              style={{ width: colWidth }}
                            />
                          )
                        })}
                      </div>

                      {/* Individual task rows */}
                      {group.tasks.map((task: any) => {
                        const reportDate = group.report.report_date
                        const color = getTaskColor(task.progress_rate)

                        return (
                          <div key={task.id} className="flex h-10 border-b">
                            {dateColumns.map((date, idx) => {
                              const dateStr = toDateString(date)
                              const isToday = isSameDay(date, today)
                              const info = formatDateHeader(date)
                              const isTaskDay = dateStr === reportDate

                              return (
                                <div
                                  key={idx}
                                  className={`border-r last:border-r-0 flex items-center justify-center px-0.5 ${
                                    isToday
                                      ? 'bg-blue-50/50 dark:bg-blue-950/20'
                                      : info.isWeekend
                                        ? 'bg-muted/10'
                                        : ''
                                  }`}
                                  style={{ width: colWidth }}
                                >
                                  {isTaskDay && (
                                    <div
                                      className={`relative h-6 w-full rounded-sm mx-0.5 ${color.bg} overflow-hidden`}
                                      title={`${task.title}: ${task.progress_rate}%`}
                                    >
                                      <div
                                        className={`absolute inset-y-0 left-0 ${color.fill} rounded-sm transition-all`}
                                        style={{ width: `${Math.max(task.progress_rate, 8)}%` }}
                                      />
                                      {colWidth >= 36 && (
                                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white mix-blend-difference">
                                          {task.progress_rate}%
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {totalTasks > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">期間内の日報数</p>
              <p className="text-2xl font-bold">{groupedReports.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">総タスク数</p>
              <p className="text-2xl font-bold">{totalTasks}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">完了タスク</p>
              <p className="text-2xl font-bold text-green-600">
                {groupedReports.reduce(
                  (sum, g) => sum + g.tasks.filter((t: any) => t.progress_rate >= 100).length,
                  0
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">平均進捗率</p>
              <p className="text-2xl font-bold text-blue-600">
                {totalTasks > 0
                  ? Math.round(
                      groupedReports.reduce(
                        (sum, g) => sum + g.tasks.reduce((s: number, t: any) => s + t.progress_rate, 0),
                        0
                      ) / totalTasks
                    )
                  : 0}
                %
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
