import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Store, Users, FileText, DollarSign, Calendar, MapPin, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('*, manager:users(name), office:offices(name)')
    .eq('id', id)
    .single()

  if (!store) notFound()

  const [castsRes, handoversRes, salesRes, shiftsRes] = await Promise.all([
    supabase.from('casts').select('*').eq('store_id', id).eq('status', 'active').order('name'),
    supabase.from('handovers').select('*, creator:users!created_by(name)').eq('store_id', id).order('handover_date', { ascending: false }).limit(20),
    supabase.from('store_sales').select('*').eq('store_id', id).order('sales_date', { ascending: false }).limit(30),
    supabase.from('shifts').select('*, cast:casts(name, stage_name)').eq('store_id', id).order('shift_date', { ascending: false }).limit(30),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/stores"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />戻る</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="h-6 w-6" />{store.name}</h1>
          <p className="text-sm text-muted-foreground">{store.store_code} | {store.area} | {(store.office as any)?.name}</p>
        </div>
      </div>

      <Tabs defaultValue="casts">
        <TabsList>
          <TabsTrigger value="casts"><Users className="mr-1 h-4 w-4" />キャスト ({castsRes.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="handovers"><FileText className="mr-1 h-4 w-4" />引き継ぎ</TabsTrigger>
          <TabsTrigger value="sales"><DollarSign className="mr-1 h-4 w-4" />売上</TabsTrigger>
          <TabsTrigger value="shifts"><Calendar className="mr-1 h-4 w-4" />シフト</TabsTrigger>
        </TabsList>

        <TabsContent value="casts" className="mt-4">
          <div className="mb-4 flex gap-2">
            <Link href={`/dashboard/stores/${id}/casts`}><Button variant="outline" size="sm"><ExternalLink className="mr-1 h-3 w-3" />キャスト管理</Button></Link>
            <Link href={`/dashboard/stores/${id}/casts/new`}><Button size="sm">新規登録</Button></Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {castsRes.data?.map((cast: any) => (
              <Card key={cast.id}>
                <CardContent className="p-4">
                  <p className="font-semibold">{cast.stage_name || cast.name}</p>
                  {cast.stage_name && <p className="text-xs text-muted-foreground">{cast.name}</p>}
                  <div className="mt-2 flex gap-2">
                    <Badge variant="outline">{cast.employment_type === 'full_time' ? '正社員' : cast.employment_type === 'part_time' ? 'パート' : '臨時'}</Badge>
                    <Badge className={cast.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}>{cast.status === 'active' ? '在籍' : '休止'}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!castsRes.data || castsRes.data.length === 0) && <p className="text-muted-foreground col-span-3 text-center py-8">キャストデータなし</p>}
          </div>
        </TabsContent>

        <TabsContent value="handovers" className="mt-4 space-y-3">
          <div className="mb-4 flex gap-2">
            <Link href={`/dashboard/stores/${id}/handovers`}><Button variant="outline" size="sm"><ExternalLink className="mr-1 h-3 w-3" />引き継ぎ管理</Button></Link>
            <Link href={`/dashboard/stores/${id}/handovers/new`}><Button size="sm">新規作成</Button></Link>
          </div>
          {handoversRes.data?.map((h: any) => (
            <Card key={h.id} className={h.is_resolved ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{h.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{h.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">{h.creator?.name} | {h.handover_date}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={h.priority === 'high' ? 'destructive' : h.priority === 'low' ? 'outline' : 'secondary'}>
                      {h.priority === 'high' ? '高' : h.priority === 'low' ? '低' : '中'}
                    </Badge>
                    {h.is_resolved && <Badge className="bg-green-50 text-green-700">解決済</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!handoversRes.data || handoversRes.data.length === 0) && <p className="text-muted-foreground text-center py-8">引き継ぎデータなし</p>}
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <div className="mb-4 flex gap-2">
            <Link href={`/dashboard/stores/${id}/sales`}><Button variant="outline" size="sm"><ExternalLink className="mr-1 h-3 w-3" />売上管理</Button></Link>
            <Link href={`/dashboard/stores/${id}/sales/new`}><Button size="sm">売上登録</Button></Link>
          </div>
          <div className="space-y-2">
            {salesRes.data?.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{s.sales_date}</p>
                  <p className="text-xs text-muted-foreground">{s.sales_type} | {s.payment_method}</p>
                </div>
                <p className="font-bold">¥{Number(s.amount).toLocaleString()}</p>
              </div>
            ))}
            {(!salesRes.data || salesRes.data.length === 0) && <p className="text-muted-foreground text-center py-8">売上データなし</p>}
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="mt-4">
          <div className="mb-4 flex gap-2">
            <Link href={`/dashboard/stores/${id}/shifts`}><Button variant="outline" size="sm"><ExternalLink className="mr-1 h-3 w-3" />シフト管理</Button></Link>
            <Link href={`/dashboard/stores/${id}/shifts/new`}><Button size="sm">シフト登録</Button></Link>
          </div>
          <div className="space-y-2">
            {shiftsRes.data?.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{s.cast?.stage_name || s.cast?.name}</p>
                  <p className="text-xs text-muted-foreground">{s.shift_date}</p>
                </div>
                <p className="text-sm">{s.start_time} - {s.end_time}</p>
              </div>
            ))}
            {(!shiftsRes.data || shiftsRes.data.length === 0) && <p className="text-muted-foreground text-center py-8">シフトデータなし</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
