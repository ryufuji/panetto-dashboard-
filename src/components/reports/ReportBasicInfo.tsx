'use client'

/**
 * 日報の「基本情報」カード。
 * 新規作成ページと編集ページで同じ項目・同じ呼称・同じ必須表示になるよう、ここに一本化している。
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock } from 'lucide-react'
import { HelpTip } from '@/components/reports/TaskListEditor'

export interface ReportBasicInfoProps {
  areas: { id: string; name: string }[]
  areaId: string
  setAreaId: (v: string) => void
  departments: { id: string; name: string }[]
  departmentId: string
  setDepartmentId: (v: string) => void
  userName: string
  reviewerName: string | null
  reportDate: string
  setReportDate: (v: string) => void
  title: string
  setTitle: (v: string) => void
  startTime: string
  setStartTime: (v: string) => void
  endTime: string
  setEndTime: (v: string) => void
  workHours: string
  setWorkHours: (v: string) => void
  computedProgressRate: number
}

const START_TIME_PRESETS = ['09:00', '10:00', '11:00', '12:00', '13:00']

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ReportBasicInfo({
  areas, areaId, setAreaId,
  departments, departmentId, setDepartmentId,
  userName, reviewerName,
  reportDate, setReportDate,
  title, setTitle,
  startTime, setStartTime,
  endTime, setEndTime,
  workHours, setWorkHours,
  computedProgressRate,
}: ReportBasicInfoProps) {
  return (
    <Card>
      <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>エリア <span className="text-red-500">(*)</span><HelpTip text="業務を行った拠点・エリア" /></Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
              <SelectContent>
                {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>部署 <span className="text-xs text-muted-foreground">（任意）</span><HelpTip text="所属部署（変更がなければそのまま）" /></Label>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={departments.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={departments.length === 0 ? '未登録' : '選択'} />
              </SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {departments.length === 0 && (
              <p className="text-xs text-muted-foreground">
                部署はまだ登録されていません。後から組織管理で追加できます。
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>氏名 <span className="text-red-500">(*)</span><HelpTip text="日報の作成者名" /></Label>
            <Input value={userName} disabled />
          </div>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          確認者（上長）: <span className="font-medium text-foreground">{reviewerName || '部署長（デフォルト）'}</span>
          <span className="ml-2">— 提出後にこの方が日報を確認します</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>報告日 <span className="text-red-500">(*)</span><HelpTip text="この日報の対象日付" /></Label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>件名（任意）<HelpTip text="日報全体のタイトル（例: 〇〇案件対応）" /></Label>
            <Input placeholder="例: A社商談・資料作成" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>開始時間 <span className="text-red-500">(*)</span><HelpTip text="業務を開始した時刻。終了時刻と合わせて稼働時間を自動計算します" /></Label>
            <Input type="time" placeholder="12:30" value={startTime} onChange={e => setStartTime(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {START_TIME_PRESETS.map(t => (
                <button key={t} type="button" onClick={() => setStartTime(t)}
                  className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>終了時間 <span className="text-red-500">(*)</span><HelpTip text="業務を終了した時刻" /></Label>
            <div className="flex items-center gap-2">
              <Input type="time" placeholder="12:30" value={endTime} onChange={e => setEndTime(e.target.value)} className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={() => setEndTime(nowHHMM())}>
                <Clock className="mr-1 h-3 w-3" />現在の時間を入力
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>稼働時間 (h)<HelpTip text="開始・終了時刻から自動計算されます（手動修正も可）" /></Label>
            <Input type="number" step="0.5" placeholder="8.0" value={workHours} onChange={e => setWorkHours(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>全体進捗率（%）</Label>
            <div className="flex items-center gap-3 h-9 px-3 rounded-md border bg-muted/30">
              <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    computedProgressRate >= 80 ? 'bg-green-500' : computedProgressRate >= 50 ? 'bg-yellow-500' : 'bg-blue-400'
                  }`}
                  style={{ width: `${computedProgressRate}%` }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums min-w-[3rem] text-right">{computedProgressRate}%</span>
            </div>
            <p className="text-xs text-muted-foreground">親タスクの進捗率の平均から自動計算</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
