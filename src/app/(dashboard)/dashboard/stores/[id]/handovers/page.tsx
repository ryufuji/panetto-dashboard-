'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, FileText, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const priorityLabels: Record<string, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
  high: { label: '高', variant: 'destructive' },
  medium: { label: '中', variant: 'secondary' },
  low: { label: '低', variant: 'outline' },
}

export default function HandoversPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const filter = searchParams.get('filter') || 'all'

  const [store, setStore] = useState<{ id: string; name: string } | null>(null)
  const [handovers, setHandovers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)

    const { data: storeData } = await supabase
      .from('stores')
      .select('id, name')
      .eq('id', id)
      .single()

    if (storeData) {
      setStore(storeData)
    }

    let query = supabase
      .from('handovers')
      .select('*, creator:users!handovers_created_by_fkey(name)')
      .eq('store_id', id)
      .order('handover_date', { ascending: false })

    if (filter === 'unresolved') {
      query = query.eq('is_resolved', false)
    } else if (filter === 'resolved') {
      query = query.eq('is_resolved', true)
    }

    const { data: handoverData, error: handoverError } = await query

    if (handoverError) {
      setError(true)
    } else {
      setHandovers(handoverData || [])
    }

    setLoading(false)
  }, [id, filter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleResolve = async (handoverId: string) => {
    setResolvingId(handoverId)
    try {
      const res = await fetch(`/api/stores/${id}/handovers/${handoverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_resolved: true }),
      })

      if (!res.ok) {
        throw new Error('Failed to resolve handover')
      }

      const { data } = await res.json()

      setHandovers((prev) =>
        prev.map((h) =>
          h.id === handoverId
            ? { ...h, is_resolved: true, resolved_by: data.resolved_by, resolved_at: data.resolved_at }
            : h
        )
      )

      toast.success('引き継ぎを解決済みにしました')
    } catch {
      toast.error('エラーが発生しました')
    } finally {
      setResolvingId(null)
    }
  }

  const unresolvedCount = handovers.filter((h: any) => !h.is_resolved).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
            <FileText className="h-6 w-6" />
            引き継ぎ一覧
          </h1>
          <p className="text-sm text-muted-foreground">
            {store?.name} - {handovers.length}件
            {unresolvedCount > 0 && ` (未解決: ${unresolvedCount}件)`}
          </p>
        </div>
        <Link href={`/dashboard/stores/${id}/handovers/new`}>
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            新規作成
          </Button>
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { value: 'all', label: '全て' },
          { value: 'unresolved', label: '未解決' },
          { value: 'resolved', label: '解決済' },
        ].map((f) => {
          const isActive = filter === f.value
          return (
            <Link
              key={f.value}
              href={`/dashboard/stores/${id}/handovers${f.value === 'all' ? '' : `?filter=${f.value}`}`}
            >
              <Button variant={isActive ? 'default' : 'outline'} size="sm">
                {f.label}
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

      {handovers.length > 0 ? (
        <div className="space-y-3">
          {handovers.map((handover: any) => {
            const priority = priorityLabels[handover.priority] || priorityLabels.medium
            return (
              <Card
                key={handover.id}
                className={handover.is_resolved ? 'opacity-60' : ''}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {handover.is_resolved ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <h3 className="font-semibold truncate">{handover.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 ml-6">
                        {handover.content}
                      </p>
                      <div className="flex items-center gap-3 mt-2 ml-6">
                        <span className="text-xs text-muted-foreground">
                          {handover.handover_date}
                        </span>
                        {handover.creator?.name && (
                          <span className="text-xs text-muted-foreground">
                            作成者: {handover.creator.name}
                          </span>
                        )}
                        {handover.category && (
                          <Badge variant="outline" className="text-xs">
                            {handover.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant={priority.variant}>{priority.label}</Badge>
                      {handover.is_resolved ? (
                        <Badge className="bg-green-50 text-green-700 border-green-200">
                          解決済
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolvingId === handover.id}
                          onClick={() => handleResolve(handover.id)}
                        >
                          {resolvingId === handover.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-4 w-4" />
                          )}
                          解決済みにする
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        !error && (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">引き継ぎデータがありません</p>
              <p className="text-sm text-muted-foreground mt-1">
                「新規作成」から引き継ぎを追加してください
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
