import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
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
import { ArrowLeft, Plus, Users } from 'lucide-react'
import Link from 'next/link'

const employmentTypeLabels: Record<string, string> = {
  full_time: '正社員',
  part_time: 'パート',
  temporary: '臨時',
}

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: '在籍', color: 'bg-green-50 text-green-700 border-green-200' },
  inactive: { label: '休止', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  retired: { label: '退職', color: 'bg-red-50 text-red-700 border-red-200' },
}

export default async function CastsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { id } = await params
  const { status: filterStatus } = await searchParams
  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!store) notFound()

  let query = supabase
    .from('casts')
    .select('*')
    .eq('store_id', id)
    .order('name')

  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('status', filterStatus)
  }

  const { data: casts, error } = await query

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
            <Users className="h-6 w-6" />
            キャスト一覧
          </h1>
          <p className="text-sm text-muted-foreground">
            {store.name} - {casts?.length || 0}名
          </p>
        </div>
        <Link href={`/dashboard/stores/${id}/casts/new`}>
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            新規登録
          </Button>
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { value: 'all', label: '全て' },
          { value: 'active', label: '在籍' },
          { value: 'inactive', label: '休止' },
          { value: 'retired', label: '退職' },
        ].map((s) => {
          const isActive = (filterStatus || 'all') === s.value
          return (
            <Link
              key={s.value}
              href={`/dashboard/stores/${id}/casts${s.value === 'all' ? '' : `?status=${s.value}`}`}
            >
              <Button variant={isActive ? 'default' : 'outline'} size="sm">
                {s.label}
              </Button>
            </Link>
          )
        })}
      </div>

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-red-600">
            データの取得に失敗しました
          </CardContent>
        </Card>
      )}

      {casts && casts.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead>源氏名</TableHead>
                <TableHead>雇用形態</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>入店日</TableHead>
                <TableHead>電話番号</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {casts.map((cast: any) => {
                const st = statusLabels[cast.status] || statusLabels.active
                return (
                  <TableRow key={cast.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell>
                      <Link
                        href={`/dashboard/stores/${id}/casts/${cast.id}`}
                        className="block font-medium text-blue-600 hover:underline"
                      >
                        {cast.name}
                      </Link>
                    </TableCell>
                    <TableCell><Link href={`/dashboard/stores/${id}/casts/${cast.id}`} className="block">{cast.stage_name || '-'}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/stores/${id}/casts/${cast.id}`} className="block">
                      {employmentTypeLabels[cast.employment_type] || cast.employment_type}
                    </Link></TableCell>
                    <TableCell><Link href={`/dashboard/stores/${id}/casts/${cast.id}`} className="block">
                      <Badge variant="outline" className={st.color}>
                        {st.label}
                      </Badge>
                    </Link></TableCell>
                    <TableCell><Link href={`/dashboard/stores/${id}/casts/${cast.id}`} className="block">{cast.hire_date || '-'}</Link></TableCell>
                    <TableCell><Link href={`/dashboard/stores/${id}/casts/${cast.id}`} className="block">{cast.phone || '-'}</Link></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        !error && (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">キャストデータがありません</p>
              <p className="text-sm text-muted-foreground mt-1">
                「新規登録」からキャストを追加してください
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
