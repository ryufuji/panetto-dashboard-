'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

const COLOR_OPTIONS = [
  { value: 'blue', label: '青', bg: 'bg-blue-500', text: 'text-white' },
  { value: 'green', label: '緑', bg: 'bg-green-500', text: 'text-white' },
  { value: 'red', label: '赤', bg: 'bg-red-500', text: 'text-white' },
  { value: 'yellow', label: '黄', bg: 'bg-yellow-500', text: 'text-black' },
  { value: 'purple', label: '紫', bg: 'bg-purple-500', text: 'text-white' },
]

function getColorClasses(color: string): { bg: string; text: string } {
  const found = COLOR_OPTIONS.find((c) => c.value === color)
  return found
    ? { bg: found.bg, text: found.text }
    : { bg: 'bg-blue-500', text: 'text-white' }
}

interface Schedule {
  id: string
  organization_id: string
  title: string
  description?: string | null
  start_at: string
  end_at?: string | null
  all_day: boolean
  color: string
  created_by: string
  created_at: string
  updated_at: string
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function formatDateForInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function SchedulePage() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Create form state
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formAllDay, setFormAllDay] = useState(true)
  const [formColor, setFormColor] = useState('blue')

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth() + 1

  const fetchSchedules = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const startOfMonth = `${monthStr}-01T00:00:00`
      const daysInMonth = getDaysInMonth(year, month)
      const endOfMonth = `${monthStr}-${String(daysInMonth).padStart(2, '0')}T23:59:59`

      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .gte('start_at', startOfMonth)
        .lte('start_at', endOfMonth)
        .order('start_at', { ascending: true })

      if (error) {
        toast.error('スケジュールの取得に失敗しました')
        console.error(error)
      } else {
        setSchedules(data || [])
      }
    } catch (err) {
      toast.error('スケジュールの取得に失敗しました')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const handlePrevMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    )
  }

  const handleNextMonth = () => {
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    )
  }

  const handleDayClick = (dayNum: number) => {
    const clickedDate = new Date(year, month - 1, dayNum)
    setFormTitle('')
    setFormDescription('')
    setFormStartDate(formatDateForInput(clickedDate))
    setFormEndDate('')
    setFormAllDay(true)
    setFormColor('blue')
    setShowCreateDialog(true)
  }

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      toast.error('タイトルを入力してください')
      return
    }
    if (!formStartDate) {
      toast.error('開始日を入力してください')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast.error('ログインが必要です')
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      const startAt = formAllDay
        ? `${formStartDate}T00:00:00`
        : `${formStartDate}T00:00:00`
      const endAt = formEndDate
        ? formAllDay
          ? `${formEndDate}T23:59:59`
          : `${formEndDate}T23:59:59`
        : null

      const { data, error } = await supabase
        .from('schedules')
        .insert({
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          start_at: startAt,
          end_at: endAt,
          all_day: formAllDay,
          color: formColor,
          created_by: user.id,
          organization_id: profile?.organization_id,
        })
        .select()
        .single()

      if (error) {
        toast.error('スケジュールの作成に失敗しました')
        console.error(error)
      } else {
        toast.success('スケジュールを作成しました')
        setShowCreateDialog(false)
        fetchSchedules()
      }
    } catch (err) {
      toast.error('スケジュールの作成に失敗しました')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setSubmitting(true)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', deleteTarget.id)

      if (error) {
        toast.error('スケジュールの削除に失敗しました')
        console.error(error)
      } else {
        toast.success('スケジュールを削除しました')
        setDeleteTarget(null)
        fetchSchedules()
      }
    } catch (err) {
      toast.error('スケジュールの削除に失敗しました')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEventClick = (e: React.MouseEvent, schedule: Schedule) => {
    e.stopPropagation()
    setDeleteTarget(schedule)
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOfWeek = getFirstDayOfWeek(year, month)
  const totalCells = firstDayOfWeek + daysInMonth
  const totalRows = Math.ceil(totalCells / 7)

  const now = new Date()
  const todayStr = formatDateForInput(now)

  // Group schedules by day
  const schedulesByDay: Record<number, Schedule[]> = {}
  for (const schedule of schedules) {
    const startDate = new Date(schedule.start_at)
    const endDate = schedule.end_at ? new Date(schedule.end_at) : startDate

    // For multi-day events, show on each day within the current month
    const loopStart = new Date(
      Math.max(startDate.getTime(), new Date(year, month - 1, 1).getTime())
    )
    const loopEnd = new Date(
      Math.min(endDate.getTime(), new Date(year, month - 1, daysInMonth, 23, 59, 59).getTime())
    )

    for (
      let d = new Date(loopStart);
      d <= loopEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const dayNum = d.getDate()
      if (!schedulesByDay[dayNum]) schedulesByDay[dayNum] = []
      // Avoid duplicates
      if (!schedulesByDay[dayNum].find((s) => s.id === schedule.id)) {
        schedulesByDay[dayNum].push(schedule)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">スケジュール</h1>
          <p className="text-muted-foreground">
            {year}年{month}月のスケジュール - 全{schedules.length}件
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[140px] text-center">
            {year}年{month}月
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5" />
            月間スケジュール
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Day of week header */}
              <div className="grid grid-cols-7 border-b">
                {DAY_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className={`py-2 text-center text-sm font-medium ${
                      i === 5
                        ? 'text-blue-600'
                        : i === 6
                          ? 'text-red-600'
                          : 'text-foreground'
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
                  const daySchedules = isValidDay
                    ? schedulesByDay[dayNum] || []
                    : []
                  const dateStr = isValidDay
                    ? `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                    : ''
                  const isToday = dateStr === todayStr
                  const dayOfWeek = cellIndex % 7

                  return (
                    <div
                      key={cellIndex}
                      className={`min-h-[100px] border-r border-b p-1.5 cursor-pointer transition-colors hover:bg-accent/50 ${
                        isToday ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                      } ${!isValidDay ? 'bg-muted/30 cursor-default hover:bg-muted/30' : ''}`}
                      onClick={() => isValidDay && handleDayClick(dayNum)}
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
                            {daySchedules.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {daySchedules.length}件
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {daySchedules.slice(0, 3).map((schedule) => {
                              const colorClasses = getColorClasses(
                                schedule.color
                              )
                              return (
                                <div
                                  key={schedule.id}
                                  className={`text-xs truncate rounded px-1.5 py-0.5 cursor-pointer hover:opacity-80 ${colorClasses.bg} ${colorClasses.text}`}
                                  onClick={(e) =>
                                    handleEventClick(e, schedule)
                                  }
                                  title={schedule.title}
                                >
                                  {schedule.title}
                                </div>
                              )
                            })}
                            {daySchedules.length > 3 && (
                              <div className="text-xs text-muted-foreground px-1">
                                +{daySchedules.length - 3}件
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Color legend */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t">
                <span className="text-xs text-muted-foreground">カラー:</span>
                {COLOR_OPTIONS.map((color) => (
                  <div key={color.value} className="flex items-center gap-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${color.bg}`}
                    />
                    <span className="text-xs">{color.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Schedule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>スケジュール作成</DialogTitle>
            <DialogDescription>
              新しいスケジュールを追加します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-title">タイトル *</Label>
              <Input
                id="schedule-title"
                placeholder="スケジュールのタイトル"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-description">説明</Label>
              <Input
                id="schedule-description"
                placeholder="説明（任意）"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-start">開始日 *</Label>
                <Input
                  id="schedule-start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-end">終了日</Label>
                <Input
                  id="schedule-end"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="schedule-allday">終日</Label>
              <Switch
                id="schedule-allday"
                checked={formAllDay}
                onCheckedChange={setFormAllDay}
              />
            </div>
            <div className="space-y-2">
              <Label>カラー</Label>
              <Select value={formColor} onValueChange={setFormColor}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3 h-3 rounded-full ${color.bg}`}
                        />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>スケジュールの削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title}」を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
