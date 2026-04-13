'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, ChevronLeft, ChevronRight, Users, CheckCircle2,
  Target, Clock, ArrowUpDown, X
} from 'lucide-react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'

type SortKey = 'name' | 'completionRate' | 'estimationAccuracy' | 'productivity' | 'workHours' | 'completedCount' | 'deadlineAdherence' | 'hourlyRate' | 'taskCost' | 'highPriorityRatio' | 'storeCompletionRate' | 'combinedCompletionRate'

interface PerformanceUser {
  user_id: string
  name: string
  position?: string
  department?: { id: string; name: string }
  monthly_salary?: number
  metrics: {
    totalTasks: number
    completedCount: number
    completionRate: number
    estimationAccuracy: number | null
    productivity: number | null
    deadlineAdherence: number | null
    hourlyRate: number | null
    taskCost: number | null
    highPriorityRatio: number | null
    workHours: number
    // Store (tasukaru) metrics
    storeTotalTasks: number | null
    storeCompletedTasks: number | null
    storeCompletionRate: number | null
    storeDeadlineAdherence: number | null
    // Combined
    combinedTotalTasks: number
    combinedCompletedCount: number
    combinedCompletionRate: number
  }
}

interface TrendData {
  label: string
  completionRate: number
  estimationAccuracy: number | null
  workHours: number
  totalTasks: number
  completedCount: number
  storeTotalTasks: number | null
  storeCompletedTasks: number | null
  storeCompletionRate: number | null
  combinedTotalTasks: number
  combinedCompletedCount: number
  combinedCompletionRate: number
}

export default function PerformancePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userRole, setUserRole] = useState<string>('')
  const [data, setData] = useState<PerformanceUser[]>([])

  // Period selector
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [customRange, setCustomRange] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('completionRate')
  const [sortAsc, setSortAsc] = useState(false)

  // Detail panel
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<TrendData[] | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  const getDateRange = useCallback(() => {
    if (customRange && dateFrom && dateTo) {
      return { from: dateFrom, to: dateTo }
    }
    return {
      from: format(currentMonth, 'yyyy-MM-dd'),
      to: format(endOfMonth(currentMonth), 'yyyy-MM-dd'),
    }
  }, [currentMonth, customRange, dateFrom, dateTo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile) {
        setIsAdmin(profile.role === 'admin')
        setUserRole(profile.role)
        if (profile.role === 'employee') {
          setLoading(false)
          return
        }
      }
    }

    const range = getDateRange()
    const res = await fetch(`/api/performance?date_from=${range.from}&date_to=${range.to}`)
    const json = await res.json()
    if (res.ok) {
      setData(json.data || [])
    }
    setLoading(false)
  }, [getDateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const fetchTrend = async (userId: string) => {
    if (selectedUserId === userId) {
      setSelectedUserId(null)
      setTrendData(null)
      return
    }
    setSelectedUserId(userId)
    setTrendLoading(true)
    const res = await fetch(`/api/performance/${userId}`)
    const json = await res.json()
    if (res.ok) {
      setTrendData(json.data)
    }
    setTrendLoading(false)
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...data].sort((a, b) => {
    let av: number | null = null
    let bv: number | null = null
    const m = (d: PerformanceUser) => d.metrics

    switch (sortKey) {
      case 'name': return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      case 'completionRate': av = m(a).completionRate; bv = m(b).completionRate; break
      case 'estimationAccuracy': av = m(a).estimationAccuracy; bv = m(b).estimationAccuracy; break
      case 'productivity': av = m(a).productivity; bv = m(b).productivity; break
      case 'workHours': av = m(a).workHours; bv = m(b).workHours; break
      case 'completedCount': av = m(a).completedCount; bv = m(b).completedCount; break
      case 'deadlineAdherence': av = m(a).deadlineAdherence; bv = m(b).deadlineAdherence; break
      case 'hourlyRate': av = m(a).hourlyRate; bv = m(b).hourlyRate; break
      case 'taskCost': av = m(a).taskCost; bv = m(b).taskCost; break
      case 'highPriorityRatio': av = m(a).highPriorityRatio; bv = m(b).highPriorityRatio; break
      case 'storeCompletionRate': av = m(a).storeCompletionRate; bv = m(b).storeCompletionRate; break
      case 'combinedCompletionRate': av = m(a).combinedCompletionRate; bv = m(b).combinedCompletionRate; break
    }
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    return sortAsc ? av - bv : bv - av
  })

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => handleSort(sortKeyName)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </span>
    </TableHead>
  )

  // KPI aggregation
  const avgCompletionRate = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.metrics.completionRate, 0) / data.length) : 0
  const estimationValues = data.filter(d => d.metrics.estimationAccuracy !== null)
  const avgEstimation = estimationValues.length > 0 ? Math.round(estimationValues.reduce((s, d) => s + d.metrics.estimationAccuracy!, 0) / estimationValues.length) : null
  const totalWorkHours = Math.round(data.reduce((s, d) => s + d.metrics.workHours, 0) * 10) / 10

  // Radar chart data for selected user
  const selectedUser = data.find(d => d.user_id === selectedUserId)
  const radarData = selectedUser ? [
    { metric: '完了率', value: selectedUser.metrics.completionRate, fullMark: 100 },
    { metric: '見積精度', value: selectedUser.metrics.estimationAccuracy ?? 0, fullMark: 200 },
    { metric: '期限遵守', value: selectedUser.metrics.deadlineAdherence ?? 0, fullMark: 100 },
    { metric: '高優先度', value: selectedUser.metrics.highPriorityRatio ?? 0, fullMark: 100 },
    { metric: '生産性', value: Math.min((selectedUser.metrics.productivity ?? 0) * 2, 100), fullMark: 100 },
    { metric: '稼働量', value: Math.min(selectedUser.metrics.workHours, 200), fullMark: 200 },
  ] : []

  if (userRole === 'employee') {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">パフォーマンス分析</h1>
        <Card><CardContent className="py-16 text-center text-muted-foreground">アクセス権限がありません</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">パフォーマンス分析</h1>

      {/* Period selector */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            {!customRange ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium min-w-[120px] text-center">
                  {format(currentMonth, 'yyyy年M月', { locale: ja })}
                </span>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
                <span className="text-muted-foreground">〜</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
                <Button size="sm" onClick={fetchData} disabled={!dateFrom || !dateTo}>適用</Button>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => {
              setCustomRange(!customRange)
              if (customRange) {
                setDateFrom('')
                setDateTo('')
              }
            }}>
              {customRange ? '月次に戻す' : 'カスタム期間'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">対象社員数</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{data.length}<span className="text-sm text-muted-foreground ml-1">名</span></div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均完了率</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{avgCompletionRate}<span className="text-sm text-muted-foreground ml-1">%</span></div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均見積精度</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{avgEstimation !== null ? `${avgEstimation}%` : '-'}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">合計稼働時間</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{totalWorkHours}<span className="text-sm text-muted-foreground ml-1">h</span></div></CardContent>
            </Card>
          </div>

          {/* Ranking Table */}
          <Card>
            <CardHeader>
              <CardTitle>社員ランキング</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <SortHeader label="社員" sortKeyName="name" />
                      <TableHead>部署</TableHead>
                      <SortHeader label="完了率" sortKeyName="completionRate" />
                      <SortHeader label="見積精度" sortKeyName="estimationAccuracy" />
                      <SortHeader label="生産性" sortKeyName="productivity" />
                      <SortHeader label="完了数" sortKeyName="completedCount" />
                      <SortHeader label="期限遵守" sortKeyName="deadlineAdherence" />
                      <SortHeader label="稼働h" sortKeyName="workHours" />
                      <SortHeader label="高優先度" sortKeyName="highPriorityRatio" />
                      <SortHeader label="タス軽完了率" sortKeyName="storeCompletionRate" />
                      <SortHeader label="統合完了率" sortKeyName="combinedCompletionRate" />
                      {isAdmin && <SortHeader label="時間単価" sortKeyName="hourlyRate" />}
                      {isAdmin && <SortHeader label="タスク単価" sortKeyName="taskCost" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row, idx) => (
                      <TableRow
                        key={row.user_id}
                        className={`cursor-pointer ${selectedUserId === row.user_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                        onClick={() => fetchTrend(row.user_id)}
                      >
                        <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{row.name}</p>
                            {row.position && <p className="text-xs text-muted-foreground">{row.position}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{row.department?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={row.metrics.completionRate >= 80 ? 'default' : row.metrics.completionRate >= 50 ? 'secondary' : 'outline'}>
                            {row.metrics.completionRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{row.metrics.estimationAccuracy !== null ? `${row.metrics.estimationAccuracy}%` : '-'}</TableCell>
                        <TableCell className="text-sm">{row.metrics.productivity !== null ? row.metrics.productivity : '-'}</TableCell>
                        <TableCell className="text-sm">{row.metrics.completedCount} / {row.metrics.totalTasks}</TableCell>
                        <TableCell className="text-sm">{row.metrics.deadlineAdherence !== null ? `${row.metrics.deadlineAdherence}%` : '-'}</TableCell>
                        <TableCell className="text-sm">{row.metrics.workHours}h</TableCell>
                        <TableCell className="text-sm">{row.metrics.highPriorityRatio !== null ? `${row.metrics.highPriorityRatio}%` : '-'}</TableCell>
                        <TableCell className="text-sm">
                          {row.metrics.storeTotalTasks !== null ? (
                            <span>{row.metrics.storeCompletedTasks}/{row.metrics.storeTotalTasks} ({row.metrics.storeCompletionRate ?? 0}%)</span>
                          ) : <span className="text-muted-foreground">未連携</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.metrics.combinedCompletionRate >= 80 ? 'default' : row.metrics.combinedCompletionRate >= 50 ? 'secondary' : 'outline'}>
                            {row.metrics.combinedCompletedCount}/{row.metrics.combinedTotalTasks} ({row.metrics.combinedCompletionRate}%)
                          </Badge>
                        </TableCell>
                        {isAdmin && <TableCell className="text-sm">{row.metrics.hourlyRate !== null ? `${row.metrics.hourlyRate.toLocaleString()}円` : '-'}</TableCell>}
                        {isAdmin && <TableCell className="text-sm">{row.metrics.taskCost !== null ? `${row.metrics.taskCost.toLocaleString()}円` : '-'}</TableCell>}
                      </TableRow>
                    ))}
                    {sorted.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 14 : 12} className="text-center py-8 text-muted-foreground">
                          データがありません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Individual Detail Panel */}
          {selectedUserId && selectedUser && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{selectedUser.name} の詳細分析</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => { setSelectedUserId(null); setTrendData(null) }}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Radar Chart */}
                    <div>
                      <h3 className="text-sm font-medium mb-4">能力レーダー</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="metric" className="text-xs" />
                          <PolarRadiusAxis angle={30} domain={[0, 'auto']} />
                          <Radar name={selectedUser.name} dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Monthly Trend Bar Chart */}
                    <div>
                      <h3 className="text-sm font-medium mb-4">月次推移（直近6ヶ月）</h3>
                      {trendData && trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" className="text-xs" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="completionRate" name="日報完了率(%)" fill="#2563eb" />
                            <Bar dataKey="storeCompletionRate" name="タス軽完了率(%)" fill="#8b5cf6" />
                            <Bar dataKey="combinedCompletionRate" name="統合完了率(%)" fill="#10b981" />
                            <Bar dataKey="workHours" name="稼働h" fill="#f59e0b" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[300px] text-muted-foreground">トレンドデータなし</div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
