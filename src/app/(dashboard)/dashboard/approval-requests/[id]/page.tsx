'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, FileText, Download,
  Loader2, Ban, FileEdit, Send, User, MessageSquare, ClipboardCheck, ExternalLink, Link2, Forward
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { use } from 'react'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-gray-50 text-gray-700' },
  pending: { label: '承認待ち', className: 'bg-orange-50 text-orange-700' },
  approved: { label: '承認済み', className: 'bg-green-50 text-green-700' },
  rejected: { label: '却下', className: 'bg-red-50 text-red-700' },
  cancelled: { label: '取消', className: 'bg-gray-50 text-gray-500' },
}

const STEP_STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: '待機中', icon: Clock, className: 'text-orange-500' },
  approved: { label: '承認', icon: CheckCircle2, className: 'text-green-500' },
  rejected: { label: '却下', icon: XCircle, className: 'text-red-500' },
  delegated: { label: '委任', icon: Forward, className: 'text-purple-500' },
}

const CATEGORY_LABELS: Record<string, string> = {
  equipment_purchase: '備品購入',
  document_review: '書類チェック',
  other: 'その他',
}

const ACTION_LABELS: Record<string, string> = {
  created: '申請作成',
  submitted: '申請提出',
  approved: '承認',
  rejected: '却下',
  cancelled: '取消',
  delegated: '委任',
}

export default function ApprovalRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [delegateeId, setDelegateeId] = useState<string>('')

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      const [res, membersRes] = await Promise.all([
        fetch(`/api/approval-requests/${id}`),
        fetch('/api/organization/users'),
      ])
      const json = await res.json()
      if (res.ok) {
        setData(json.data)
      } else {
        toast.error(json.error || '読み込みに失敗しました')
      }

      const membersJson = await membersRes.json()
      if (membersRes.ok) {
        setMembers(membersJson.data || [])
      }

      setLoading(false)
    }
    loadData()
  }, [id])

  const handleAction = async (action: 'approve' | 'reject' | 'cancel') => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/approval-requests/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: comment.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const messages: Record<string, string> = {
        approve: '承認しました',
        reject: '却下しました',
        cancel: '取消しました',
      }
      toast.success(messages[action])
      router.push('/dashboard/approval-requests')
    } catch (err: any) {
      toast.error(err.message || '操作に失敗しました')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelegate = async () => {
    if (!delegateeId) {
      toast.error('委任先ユーザーを選択してください')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/approval-requests/${id}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delegatee_id: delegateeId,
          comment: comment.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success('委任しました')
      router.push('/dashboard/approval-requests')
    } catch (err: any) {
      toast.error(err.message || '委任に失敗しました')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data: urlData } = await supabase.storage
      .from('approval-files')
      .createSignedUrl(filePath, 60)
    if (urlData?.signedUrl) {
      const a = document.createElement('a')
      a.href = urlData.signedUrl
      a.download = fileName
      a.click()
    } else {
      toast.error('ダウンロードURLの取得に失敗しました')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/approval-requests">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <p className="text-muted-foreground">申請が見つかりません</p>
      </div>
    )
  }

  const statusConf = STATUS_CONFIG[data.status] || STATUS_CONFIG.draft
  const isRequester = currentUserId === data.requester_id
  const isCurrentApprover = data.steps?.some(
    (s: any) => s.step_number === data.current_step && s.approver_id === currentUserId && s.status === 'pending'
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/approval-requests">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{data.title}</h1>
            <Badge className={statusConf.className}>{statusConf.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {data.requester?.name} | {new Date(data.created_at).toLocaleDateString('ja-JP')}
          </p>
        </div>
        {isRequester && data.status === 'draft' && (
          <Link href={`/dashboard/approval-requests/${id}/edit`}>
            <Button variant="outline">
              <FileEdit className="mr-2 h-4 w-4" />編集
            </Button>
          </Link>
        )}
      </div>

      {/* Request details */}
      <Card>
        <CardHeader>
          <CardTitle>申請内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">カテゴリ</p>
              <p className="font-medium">
                {CATEGORY_LABELS[data.category] || data.custom_category || data.category}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">金額</p>
              <p className="font-medium">
                {data.amount != null ? `¥${Number(data.amount).toLocaleString()}` : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">申請者</p>
              <p className="font-medium">{data.requester?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">部署</p>
              <p className="font-medium">{data.requester?.department?.name || '-'}</p>
            </div>
          </div>
          {data.category === 'equipment_purchase' && (data.equipment_purpose || data.equipment_user) && (
            <div className="grid grid-cols-2 gap-4">
              {data.equipment_purpose && (
                <div>
                  <p className="text-sm text-muted-foreground">使用目的</p>
                  <p className="font-medium">{data.equipment_purpose}</p>
                </div>
              )}
              {data.equipment_user && (
                <div>
                  <p className="text-sm text-muted-foreground">使用者</p>
                  <p className="font-medium">{data.equipment_user}</p>
                </div>
              )}
            </div>
          )}
          {data.description && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">詳細説明</p>
              <p className="whitespace-pre-wrap text-sm">{data.description}</p>
            </div>
          )}
          {data.file_url && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">関連ファイル</p>
              <a
                href={data.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border p-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{data.file_url}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related report task */}
      {data.report_task && (
        <Card>
          <CardHeader>
            <CardTitle>関連日報タスク</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{data.report_task.title}</p>
              </div>
              <Link href={`/dashboard/reports/${data.report_task.report_id}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3 w-3 mr-1" />日報を見る
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval steps */}
      {data.steps && data.steps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>承認ステップ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.steps.map((step: any) => {
                const stepConf = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.pending
                const StepIcon = stepConf.icon
                const isCurrent = step.step_number === data.current_step && data.status === 'pending'
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-4 rounded-lg border p-4 ${
                      isCurrent ? 'border-blue-200 bg-blue-50/50' : ''
                    }`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                      step.status === 'approved' ? 'bg-green-100 text-green-700' :
                      step.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      step.status === 'delegated' ? 'bg-purple-100 text-purple-700' :
                      isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {step.step_number}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{step.approver?.name || '不明'}</span>
                        {isCurrent && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">現在のステップ</Badge>
                        )}
                      </div>
                      {step.comment && (
                        <p className="text-sm text-muted-foreground mt-1">{step.comment}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StepIcon className={`h-5 w-5 ${stepConf.className}`} />
                      <span className={`text-sm font-medium ${stepConf.className}`}>
                        {stepConf.label}
                      </span>
                      {step.acted_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(step.acted_at).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {data.attachments && data.attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>添付ファイル</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.attachments.map((att: any) => (
                <div key={att.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{att.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {att.file_size < 1024 * 1024
                        ? `${Math.round(att.file_size / 1024)} KB`
                        : `${(att.file_size / (1024 * 1024)).toFixed(1)} MB`
                      }
                      {att.uploader?.name && ` | ${att.uploader.name}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(att.file_path, att.file_name)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {(isCurrentApprover || (isRequester && data.status === 'pending')) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {isCurrentApprover ? '承認・却下・委任' : '申請の取消'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="comment">コメント</Label>
              <Textarea
                id="comment"
                placeholder="コメントを入力（任意）"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                disabled={actionLoading}
              />
            </div>
            {isCurrentApprover && (
              <div className="space-y-2">
                <Label>委任先ユーザー</Label>
                <Select value={delegateeId} onValueChange={setDelegateeId} disabled={actionLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="委任先を選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter(m =>
                        m.id !== currentUserId &&
                        !data.steps?.some((s: any) => s.approver_id === m.id && s.status === 'pending')
                      )
                      .map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}{m.department?.name ? ` (${m.department.name})` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-3">
              {isCurrentApprover && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleDelegate}
                    disabled={actionLoading || !delegateeId}
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  >
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Forward className="mr-2 h-4 w-4" />}
                    委任
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleAction('reject')}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    却下
                  </Button>
                  <Button
                    onClick={() => handleAction('approve')}
                    disabled={actionLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    承認
                  </Button>
                </>
              )}
              {isRequester && data.status === 'pending' && (
                <Button
                  variant="outline"
                  onClick={() => handleAction('cancel')}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                  取消
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {data.history && data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>履歴</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.history.map((entry: any) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <MessageSquare className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <p>
                      <span className="font-medium">{entry.actor?.name || '不明'}</span>
                      <span className="text-muted-foreground"> が </span>
                      <span className="font-medium">{ACTION_LABELS[entry.action] || entry.action}</span>
                      {entry.step_number && (
                        <span className="text-muted-foreground"> (ステップ {entry.step_number})</span>
                      )}
                    </p>
                    {entry.comment && (
                      <p className="text-muted-foreground mt-0.5">{entry.comment}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(entry.created_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
