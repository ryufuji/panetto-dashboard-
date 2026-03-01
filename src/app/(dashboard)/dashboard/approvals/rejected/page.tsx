import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { XCircle } from 'lucide-react'
import Link from 'next/link'

export default async function RejectedPage() {
  const supabase = await createClient()
  const { data: approvals } = await supabase
    .from('approvals')
    .select('*, report:reports(report_date), requester:users!approvals_requester_id_fkey(name)')
    .eq('status', 'rejected')
    .order('responded_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">却下一覧</h1>
      <div className="space-y-3">
        {approvals?.map((a: any) => (
          <Link key={a.id} href={`/dashboard/approvals/${a.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium text-sm">{a.requester?.name}</p>
                    <p className="text-xs text-muted-foreground">{a.report?.report_date}</p>
                  </div>
                </div>
                <Badge variant="destructive">却下</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(!approvals || approvals.length === 0) && (
          <p className="text-center text-muted-foreground py-8">却下されたデータはありません</p>
        )}
      </div>
    </div>
  )
}
