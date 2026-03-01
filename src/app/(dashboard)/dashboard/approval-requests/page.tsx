'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClipboardList, Plus, Search, Clock, CheckCircle2, XCircle, FileEdit, Ban } from 'lucide-react'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string; icon: typeof Clock }> = {
  draft: { label: '下書き', variant: 'secondary', className: 'bg-gray-50 text-gray-700', icon: FileEdit },
  pending: { label: '承認待ち', variant: 'outline', className: 'bg-orange-50 text-orange-700', icon: Clock },
  approved: { label: '承認済み', variant: 'default', className: 'bg-green-50 text-green-700', icon: CheckCircle2 },
  rejected: { label: '却下', variant: 'destructive', className: 'bg-red-50 text-red-700', icon: XCircle },
  cancelled: { label: '取消', variant: 'secondary', className: 'bg-gray-50 text-gray-500', icon: Ban },
}

const CATEGORY_LABELS: Record<string, string> = {
  equipment_purchase: '備品購入',
  document_review: '書類チェック',
  other: 'その他',
}

const TABS = [
  { key: 'all', label: '全て' },
  { key: 'mine', label: '自分の申請' },
  { key: 'pending_approval', label: '承認待ち' },
]

export default function ApprovalRequestsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState('all')
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('tab', tab)

      const res = await fetch(`/api/approval-requests?${params.toString()}`)
      const json = await res.json()
      if (res.ok) {
        setRequests(json.data || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const filtered = search
    ? requests.filter(r =>
        r.title?.toLowerCase().includes(search.toLowerCase()) ||
        r.requester?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : requests

  const formatAmount = (amount: number | null) => {
    if (amount == null) return '-'
    return `¥${Number(amount).toLocaleString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">申請管理</h1>
          <p className="text-muted-foreground">申請の作成・確認・承認を行います</p>
        </div>
        <Link href="/dashboard/approval-requests/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />新規申請
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="タイトルまたは申請者名で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">読み込み中...</p>
            </CardContent>
          </Card>
        ) : filtered.length > 0 ? (
          filtered.map((req: any) => {
            const statusConf = STATUS_CONFIG[req.status] || STATUS_CONFIG.draft
            const StatusIcon = statusConf.icon
            return (
              <Link key={req.id} href={`/dashboard/approval-requests/${req.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        req.status === 'pending' ? 'bg-orange-50' :
                        req.status === 'approved' ? 'bg-green-50' :
                        req.status === 'rejected' ? 'bg-red-50' : 'bg-gray-50'
                      }`}>
                        <StatusIcon className={`h-5 w-5 ${
                          req.status === 'pending' ? 'text-orange-500' :
                          req.status === 'approved' ? 'text-green-500' :
                          req.status === 'rejected' ? 'text-red-500' : 'text-gray-500'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium">{req.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {req.requester?.name} | {CATEGORY_LABELS[req.category] || req.custom_category || req.category}
                          {req.amount != null && ` | ${formatAmount(req.amount)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {req.status === 'pending' && req.total_steps > 1 && (
                        <span className="text-xs text-muted-foreground">
                          ステップ {req.current_step}/{req.total_steps}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString('ja-JP')}
                      </span>
                      <Badge variant={statusConf.variant} className={statusConf.className}>
                        {statusConf.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium text-lg">申請がありません</p>
              <p className="text-sm text-muted-foreground">
                {tab === 'pending_approval' ? '承認待ちの申請はありません' : '新規申請を作成してください'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
