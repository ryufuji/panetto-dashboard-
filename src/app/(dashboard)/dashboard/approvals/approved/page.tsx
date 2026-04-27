import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle } from 'lucide-react'
import Link from 'next/link'

/**
 * 承認済み日報一覧
 *
 * 旧: approvals.status='approved' を取得
 * 新: report_views を使い、提出済みかつ「本人以外の閲覧者がいる」日報を表示
 *     表示文言は「承認済み / 承認」で統一（閲覧 = 承認 という意味付け）
 */
export default async function ConfirmedReportsPage() {
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from('reports')
    .select(
      'id, report_date, title, user_id, submitted_at, ' +
      'user:users(name, department:departments!users_department_id_fkey(name))'
    )
    .in('status', ['submitted', 'approved'])
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(100)

  const reportIds = (reports || []).map((r: any) => r.id)

  // 全レビュー（本人以外）を取得して、ファースト閲覧者と日時を集計
  const firstViewMap = new Map<string, { viewer_name: string | null; viewed_at: string }>()
  if (reportIds.length > 0) {
    const { data: views } = await supabase
      .from('report_views')
      .select('report_id, user_id, viewed_at, user:users(name)')
      .in('report_id', reportIds)
      .order('viewed_at', { ascending: true })

    const ownerMap = new Map<string, string>()
    for (const r of (reports || []) as any[]) ownerMap.set(r.id, r.user_id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of (views || []) as any[]) {
      if (ownerMap.get(v.report_id) === v.user_id) continue // 本人は除外
      if (firstViewMap.has(v.report_id)) continue // 既に最古のレコードを記録済み
      // user は join で配列にも単一でも返り得るので両対応
      const userName = Array.isArray(v.user) ? (v.user[0]?.name ?? null) : (v.user?.name ?? null)
      firstViewMap.set(v.report_id, {
        viewer_name: userName,
        viewed_at: v.viewed_at,
      })
    }
  }

  const confirmed = (reports || []).filter((r: any) => firstViewMap.has(r.id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">承認済み</h1>
        <p className="text-muted-foreground">
          {confirmed.length}件 — 提出者以外が閲覧したことで承認扱いになった日報（最新100件）
        </p>
      </div>
      <div className="space-y-3">
        {confirmed.length > 0 ? confirmed.map((r: any) => {
          const fv = firstViewMap.get(r.id)
          return (
            <Link key={r.id} href={`/dashboard/reports/${r.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium text-sm">
                        {r.user?.name || '不明'}
                        {r.title ? ` - ${r.title}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.report_date}
                        {r.user?.department?.name ? ` | ${r.user.department.name}` : ''}
                      </p>
                      {fv && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          承認者: {fv.viewer_name || '不明'}（{new Date(fv.viewed_at).toLocaleString('ja-JP')}）
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-green-50 text-green-700 border-green-200">承認済</Badge>
                </CardContent>
              </Card>
            </Link>
          )
        }) : (
          <p className="text-center text-muted-foreground py-8">承認済みの日報はありません</p>
        )}
      </div>
    </div>
  )
}
