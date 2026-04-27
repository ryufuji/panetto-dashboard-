import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Eye, BarChart3 } from 'lucide-react'

/**
 * 確認統計
 *
 * 旧: approvals.status のカウントベース
 * 新: report_views を使い、提出済み日報のうち本人以外が閲覧した割合を集計
 */
export default async function ConfirmationStatisticsPage() {
  const supabase = await createClient()

  // 提出済み日報を取得
  const { data: reports } = await supabase
    .from('reports')
    .select('id, user_id')
    .in('status', ['submitted', 'approved'])

  const reportIds = (reports || []).map((r: any) => r.id)

  let confirmedCount = 0
  if (reportIds.length > 0) {
    const { data: views } = await supabase
      .from('report_views')
      .select('report_id, user_id')
      .in('report_id', reportIds)

    const ownerMap = new Map<string, string>()
    for (const r of (reports || []) as any[]) ownerMap.set(r.id, r.user_id)

    const viewedByOther = new Set<string>()
    for (const v of (views || []) as { report_id: string; user_id: string }[]) {
      if (ownerMap.get(v.report_id) !== v.user_id) viewedByOther.add(v.report_id)
    }
    confirmedCount = viewedByOther.size
  }

  const total = reports?.length || 0
  const pendingCount = total - confirmedCount
  const confirmRate = total > 0 ? Math.round((confirmedCount / total) * 100) : 0

  const stats = [
    { label: '未確認', value: pendingCount, icon: Eye, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: '確認済み', value: confirmedCount, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">確認統計</h1>
        <p className="text-muted-foreground">
          提出された日報全{total}件のうち、本人以外が閲覧した割合
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.bg}`}>
                <s.icon className={`h-6 w-6 ${s.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-3xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />確認率
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-green-600">{confirmRate}%</p>
          <p className="text-sm text-muted-foreground mt-1">
            全{total}件中{confirmedCount}件で本人以外の閲覧あり
          </p>
          {total > 0 && (
            <div className="mt-4 h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  confirmRate >= 80 ? 'bg-green-500' : confirmRate >= 50 ? 'bg-yellow-500' : 'bg-orange-400'
                }`}
                style={{ width: `${confirmRate}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
