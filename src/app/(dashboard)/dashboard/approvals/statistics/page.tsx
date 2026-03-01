import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, Clock, BarChart3 } from 'lucide-react'

export default async function ApprovalStatisticsPage() {
  const supabase = await createClient()

  const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
    supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
  ])

  const stats = [
    { label: '確認待ち', value: pendingRes.count || 0, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: '確認済み', value: approvedRes.count || 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '却下', value: rejectedRes.count || 0, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ]

  const total = (pendingRes.count || 0) + (approvedRes.count || 0) + (rejectedRes.count || 0)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">確認統計</h1>
      <div className="grid gap-4 md:grid-cols-3">
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
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />確認率</CardTitle></CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-green-600">{total > 0 ? Math.round(((approvedRes.count || 0) / total) * 100) : 0}%</p>
          <p className="text-sm text-muted-foreground mt-1">全{total}件中{approvedRes.count || 0}件確認</p>
        </CardContent>
      </Card>
    </div>
  )
}
