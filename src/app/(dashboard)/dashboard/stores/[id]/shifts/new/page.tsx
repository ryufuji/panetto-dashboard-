'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Cast {
  id: string
  name: string
  stage_name: string | null
}

export default function NewShiftPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [castsLoading, setCastsLoading] = useState(true)
  const [casts, setCasts] = useState<Cast[]>([])

  const [castId, setCastId] = useState<string>('')
  const [shiftDate, setShiftDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [startTime, setStartTime] = useState('20:00')
  const [endTime, setEndTime] = useState('01:00')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [shiftType, setShiftType] = useState('regular')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const fetchCasts = async () => {
      setCastsLoading(true)
      try {
        const { data, error } = await supabase
          .from('casts')
          .select('id, name, stage_name')
          .eq('store_id', id)
          .eq('status', 'active')
          .order('name')

        if (error) throw error
        setCasts(data || [])
      } catch (err: any) {
        toast.error('キャスト一覧の取得に失敗しました')
      } finally {
        setCastsLoading(false)
      }
    }

    fetchCasts()
  }, [id, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!castId) {
      toast.error('キャストを選択してください')
      return
    }
    if (!shiftDate) {
      toast.error('日付を入力してください')
      return
    }
    if (!startTime || !endTime) {
      toast.error('開始時間と終了時間を入力してください')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('shifts').insert({
        store_id: id,
        cast_id: castId,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        break_minutes: Number(breakMinutes) || 0,
        shift_type: shiftType,
        status: 'scheduled',
        notes: notes.trim() || null,
      })

      if (error) throw error

      toast.success('シフトを登録しました')
      router.push(`/dashboard/stores/${id}/shifts`)
    } catch (err: any) {
      toast.error(err.message || '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/stores/${id}/shifts`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">シフト登録</h1>
          <p className="text-sm text-muted-foreground">
            シフト情報を入力してください
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>シフト情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>
                キャスト <span className="text-red-500">*</span>
              </Label>
              {castsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  キャスト一覧を読み込み中...
                </div>
              ) : casts.length > 0 ? (
                <Select value={castId} onValueChange={setCastId}>
                  <SelectTrigger>
                    <SelectValue placeholder="キャストを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {casts.map((cast) => (
                      <SelectItem key={cast.id} value={cast.id}>
                        {cast.stage_name
                          ? `${cast.stage_name}（${cast.name}）`
                          : cast.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  在籍中のキャストがいません。先にキャストを登録してください。
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shiftDate">
                  日付 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="shiftDate"
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>シフト種別</Label>
                <Select value={shiftType} onValueChange={setShiftType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">通常</SelectItem>
                    <SelectItem value="overtime">残業</SelectItem>
                    <SelectItem value="holiday">休日</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="startTime">
                  開始時間 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">
                  終了時間 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="breakMinutes">休憩時間（分）</Label>
                <Input
                  id="breakMinutes"
                  type="number"
                  min="0"
                  step="5"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                placeholder="特記事項があれば入力..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Link href={`/dashboard/stores/${id}/shifts`}>
            <Button variant="outline" type="button">
              キャンセル
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={loading || castsLoading || casts.length === 0}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            登録する
          </Button>
        </div>
      </form>
    </div>
  )
}
