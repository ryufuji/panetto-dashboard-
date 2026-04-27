import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckSquare, Eye } from 'lucide-react'
import Link from 'next/link'

/**
 * 確認待ち日報一覧
 *
 * 旧: approvals.status='pending' を取得していた（部長承認の待ち列）
 * 新: report_views を使い、提出済みでまだ「本人以外の閲覧者」がいない日報を表示
 */
export default async function PendingConfirmationsPage() {
  const supabase = await createClient()

  // 提出済み日報を取得（status: submitted / approved 両方）
  const { data: reports } = await supabase
    .from('reports')
    .select(
      'id, report_date, title, user_id, submitted_at, ' +
      'user:users(name, department:departments!users_department_id_fkey(name))'
    )
    .in('status', ['submitted', 'approved'])
    .order('submitted_at', { ascending: false, nullsFirst: false })

  // 上記レポートのviewsを取得して、本人以外の閲覧者がいるかを判定
  const reportIds = (reports || []).map((r: any) => r.id)
  let viewedByOther = new Set<string>()
  if (reportIds.length > 0) {
    const { data: views } = await supabase
      .from('report_views')
      .select('report_id, user_id')
      .in('report_id', reportIds)

    const ownerMap = new Map<string, string>()
    for (const r of (reports || []) as any[]) ownerMap.set(r.id, r.user_id)
    for (const v of (views || []) as { report_id: string; user_id: string }[]) {
      if (ownerMap.get(v.report_id) !== v.user_id) viewedByOther.add(v.report_id)
    }
  }

  const pending = (reports || []).filter((r: any) => !viewedByOther.has(r.id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">確認待ち</h1>
        <p className="text-muted-foreground">
          {pending.length}件 — 提出されたが、まだ本人以外が閲覧していない日報
        </p>
      </div>
      <div className="space-y-3">
        {pending.length > 0 ? pending.map((r: any) => (
          <Link key={r.id} href={`/dashboard/reports/${r.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                    <Eye className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {r.user?.name || '不明'} の日報
                      {r.title ? ` - ${r.title}` : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.report_date}
                      {r.user?.department?.name ? ` | ${r.user.department.name}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.submitted_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.submitted_at).toLocaleString('ja-JP')}
                    </span>
                  )}
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">未確認</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        )) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <CheckSquare className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium text-lg">未確認の日報はありません</p>
              <p className="text-sm text-muted-foreground">提出された日報はすべて誰かが閲覧しています</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
