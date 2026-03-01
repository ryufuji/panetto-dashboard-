import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckSquare, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function PendingApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: approvals } = await supabase
    .from('approvals')
    .select('*, report:reports(*, user:users(name, department:departments!users_department_id_fkey(name))), requester:users!approvals_requester_id_fkey(name)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">確認待ち</h1>
        <p className="text-muted-foreground">{approvals?.length || 0}件の確認待ち</p>
      </div>
      <div className="space-y-3">
        {approvals && approvals.length > 0 ? approvals.map((a: any) => (
          <Link key={a.id} href={`/dashboard/approvals/${a.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                    <Clock className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-medium">{a.requester?.name}の日報</p>
                    <p className="text-sm text-muted-foreground">
                      {a.report?.report_date} | {a.report?.user?.department?.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{new Date(a.requested_at).toLocaleString('ja-JP')}</span>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700">確認待ち</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        )) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <CheckSquare className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium text-lg">確認待ちはありません</p>
              <p className="text-sm text-muted-foreground">すべて処理済みです</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
