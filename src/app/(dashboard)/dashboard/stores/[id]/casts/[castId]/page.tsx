import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, User, Phone, Mail, Calendar, Briefcase } from 'lucide-react'
import Link from 'next/link'
import CastEditForm from './cast-edit-form'

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

export default async function CastDetailPage({
  params,
}: {
  params: Promise<{ id: string; castId: string }>
}) {
  const { id, castId } = await params
  const supabase = await createClient()

  const { data: cast } = await supabase
    .from('casts')
    .select('*')
    .eq('id', castId)
    .eq('store_id', id)
    .single()

  if (!cast) notFound()

  const st = statusLabels[cast.status] || statusLabels.active

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/stores/${id}/casts`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <User className="h-6 w-6" />
            {cast.stage_name || cast.name}
          </h1>
          {cast.stage_name && (
            <p className="text-sm text-muted-foreground">{cast.name}</p>
          )}
        </div>
        <Badge variant="outline" className={st.color}>
          {st.label}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                氏名
              </dt>
              <dd className="font-medium">{cast.name}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">源氏名</dt>
              <dd className="font-medium">{cast.stage_name || '-'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                電話番号
              </dt>
              <dd className="font-medium">{cast.phone || '-'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                メールアドレス
              </dt>
              <dd className="font-medium">{cast.email || '-'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                雇用形態
              </dt>
              <dd className="font-medium">
                {employmentTypeLabels[cast.employment_type] || cast.employment_type}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                入店日
              </dt>
              <dd className="font-medium">{cast.hire_date || '-'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                生年月日
              </dt>
              <dd className="font-medium">{cast.birth_date || '-'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">ステータス</dt>
              <dd>
                <Badge variant="outline" className={st.color}>
                  {st.label}
                </Badge>
              </dd>
            </div>
          </dl>

          {cast.skills && cast.skills.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">スキル</p>
                <div className="flex flex-wrap gap-2">
                  {cast.skills.map((skill: string, i: number) => (
                    <Badge key={i} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {cast.notes && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">備考</p>
                <p className="text-sm whitespace-pre-wrap">{cast.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CastEditForm cast={cast} storeId={id} />
    </div>
  )
}
