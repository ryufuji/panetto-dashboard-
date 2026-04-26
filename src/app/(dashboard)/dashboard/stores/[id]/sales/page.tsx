import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, DollarSign, TrendingUp, Calendar, BarChart3 } from 'lucide-react'
import Link from 'next/link'

const salesTypeLabels: Record<string, string> = {
  drink: 'ドリンク',
  food: 'フード',
  bottle: 'ボトル',
  other: 'その他',
}

const paymentMethodLabels: Record<string, string> = {
  cash: '現金',
  card: 'カード',
  electronic: '電子マネー',
}

export default async function SalesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!store) notFound()

  const { data: sales, error } = await supabase
    .from('store_sales')
    .select('*')
    .eq('store_id', id)
    .order('sales_date', { ascending: false })

  // Calculate summaries (JST基準の今日。サーバーがUTCで動くため+9hシフト)
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const currentMonth = today.substring(0, 7)

  const todaySales = sales?.filter((s: any) => s.sales_date === today) || []
  const monthSales =
    sales?.filter((s: any) => s.sales_date?.startsWith(currentMonth)) || []

  const todayTotal = todaySales.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  )
  const monthTotal = monthSales.reduce(
    (sum: number, s: any) => sum + Number(s.amount || 0),
    0
  )

  // Calculate unique days in the month that have sales
  const uniqueDays = new Set(monthSales.map((s: any) => s.sales_date)).size
  const dailyAverage = uniqueDays > 0 ? Math.round(monthTotal / uniqueDays) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/stores/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            売上一覧
          </h1>
          <p className="text-sm text-muted-foreground">
            {store.name} - {sales?.length || 0}件
          </p>
        </div>
        <Link href={`/dashboard/stores/${id}/sales/new`}>
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            売上登録
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">今月の売上</p>
                <p className="text-2xl font-bold">
                  ¥{monthTotal.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">本日の売上</p>
                <p className="text-2xl font-bold">
                  ¥{todayTotal.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">日平均売上</p>
                <p className="text-2xl font-bold">
                  ¥{dailyAverage.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-red-600">
            データの取得に失敗しました
          </CardContent>
        </Card>
      )}

      {sales && sales.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>種別</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead>支払方法</TableHead>
                <TableHead>備考</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale: any) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">
                    {sale.sales_date}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {salesTypeLabels[sale.sales_type] || sale.sales_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    ¥{Number(sale.amount || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {sale.quantity || '-'}
                  </TableCell>
                  <TableCell>
                    {paymentMethodLabels[sale.payment_method] ||
                      sale.payment_method ||
                      '-'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {sale.notes || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        !error && (
          <Card>
            <CardContent className="text-center py-12">
              <DollarSign className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">売上データがありません</p>
              <p className="text-sm text-muted-foreground mt-1">
                「売上登録」から売上を記録してください
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
