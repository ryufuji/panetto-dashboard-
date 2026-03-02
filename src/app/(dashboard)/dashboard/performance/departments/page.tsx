'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'

interface DepartmentSummary {
  department_id: string
  name: string
  members: number
  avgCompletionRate: number
  avgEstimationAccuracy: number | null
  totalTasks: number
  totalHours: number
}

export default function DepartmentPerformancePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [departments, setDepartments] = useState<DepartmentSummary[]>([])

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [customRange, setCustomRange] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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
        if (profile.role !== 'admin') {
          setLoading(false)
          return
        }
      }
    }

    const range = getDateRange()
    const res = await fetch(`/api/performance?date_from=${range.from}&date_to=${range.to}`)
    const json = await res.json()
    if (res.ok) {
      setDepartments(json.departmentSummary || [])
    }
    setLoading(false)
  }, [getDateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  if (!isAdmin && !loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">部署比較</h1>
        <Card><CardContent className="py-16 text-center text-muted-foreground">管理者のみアクセスできます</CardContent></Card>
      </div>
    )
  }

  const chartData = departments.map(d => ({
    name: d.name,
    '平均完了率': d.avgCompletionRate,
    '平均見積精度': d.avgEstimationAccuracy ?? 0,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">部署比較</h1>

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
          {/* Bar Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>部署別パフォーマンス</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 50)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={70} className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="平均完了率" fill="#2563eb" />
                    <Bar dataKey="平均見積精度" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle>部署別比較テーブル</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>部署</TableHead>
                    <TableHead className="text-right">メンバー数</TableHead>
                    <TableHead className="text-right">平均完了率</TableHead>
                    <TableHead className="text-right">平均見積精度</TableHead>
                    <TableHead className="text-right">合計タスク数</TableHead>
                    <TableHead className="text-right">合計稼働時間</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map(d => (
                    <TableRow key={d.department_id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-right">{d.members}名</TableCell>
                      <TableCell className="text-right">{d.avgCompletionRate}%</TableCell>
                      <TableCell className="text-right">{d.avgEstimationAccuracy !== null ? `${d.avgEstimationAccuracy}%` : '-'}</TableCell>
                      <TableCell className="text-right">{d.totalTasks}</TableCell>
                      <TableCell className="text-right">{d.totalHours}h</TableCell>
                    </TableRow>
                  ))}
                  {departments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        データがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
