import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, Calendar, Clock } from 'lucide-react'
import Link from 'next/link'

const shiftTypeLabels: Record<string, string> = {
  regular: '通常',
  overtime: '残業',
  holiday: '休日',
}

const shiftStatusLabels: Record<
  string,
  { label: string; color: string }
> = {
  scheduled: {
    label: '予定',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  confirmed: {
    label: '確定',
    color: 'bg-green-50 text-green-700 border-green-200',
  },
  completed: {
    label: '完了',
    color: 'bg-gray-50 text-gray-700 border-gray-200',
  },
  absent: {
    label: '欠席',
    color: 'bg-red-50 text-red-700 border-red-200',
  },
}

function formatTime(time: string | null): string {
  if (!time) return '-'
  // Handle both HH:MM:SS and HH:MM formats
  return time.substring(0, 5)
}

function calculateHours(
  start: string | null,
  end: string | null,
  breakMinutes: number | null
): string {
  if (!start || !end) return '-'
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const totalMinutes = eh * 60 + em - (sh * 60 + sm) - (breakMinutes || 0)
  if (totalMinutes <= 0) return '-'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`
}

export default async function ShiftsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!store) notFound()

  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*, cast:casts(name, stage_name)')
    .eq('store_id', id)
    .order('shift_date', { ascending: false })
    .order('start_time', { ascending: true })

  // Group shifts by date for display
  const shiftsByDate: Record<string, any[]> = {}
  shifts?.forEach((shift: any) => {
    const date = shift.shift_date || 'unknown'
    if (!shiftsByDate[date]) shiftsByDate[date] = []
    shiftsByDate[date].push(shift)
  })

  const sortedDates = Object.keys(shiftsByDate).sort((a, b) =>
    b.localeCompare(a)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/stores/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            シフト一覧
          </h1>
          <p className="text-sm text-muted-foreground">
            {store.name} - {shifts?.length || 0}件
          </p>
        </div>
        <Link href={`/dashboard/stores/${id}/shifts/new`}>
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            シフト登録
          </Button>
        </Link>
      </div>

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-red-600">
            データの取得に失敗しました
          </CardContent>
        </Card>
      )}

      {sortedDates.length > 0 ? (
        <div className="space-y-4">
          {sortedDates.map((date) => {
            const dateShifts = shiftsByDate[date]
            const dayOfWeek = new Date(date + 'T00:00:00').toLocaleDateString(
              'ja-JP',
              { weekday: 'short' }
            )
            return (
              <Card key={date}>
                <CardContent className="p-0">
                  <div className="border-b bg-muted/50 px-5 py-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {date}（{dayOfWeek}）
                      <Badge variant="outline" className="ml-2">
                        {dateShifts.length}名
                      </Badge>
                    </h3>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>キャスト</TableHead>
                        <TableHead>時間</TableHead>
                        <TableHead>実働</TableHead>
                        <TableHead>種別</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead>備考</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dateShifts.map((shift: any) => {
                        const st =
                          shiftStatusLabels[shift.status] ||
                          shiftStatusLabels.scheduled
                        return (
                          <TableRow key={shift.id}>
                            <TableCell className="font-medium">
                              {shift.cast?.stage_name || shift.cast?.name || '-'}
                              {shift.cast?.stage_name && shift.cast?.name && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({shift.cast.name})
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                {formatTime(shift.start_time)} -{' '}
                                {formatTime(shift.end_time)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {calculateHours(
                                shift.start_time,
                                shift.end_time,
                                shift.break_minutes
                              )}
                              {shift.break_minutes > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  (休憩{shift.break_minutes}分)
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {shiftTypeLabels[shift.shift_type] ||
                                  shift.shift_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={st.color}>
                                {st.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate text-muted-foreground">
                              {shift.notes || '-'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        !error && (
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">シフトデータがありません</p>
              <p className="text-sm text-muted-foreground mt-1">
                「シフト登録」からシフトを追加してください
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
