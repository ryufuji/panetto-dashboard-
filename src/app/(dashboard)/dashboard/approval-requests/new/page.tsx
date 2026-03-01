'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Plus, X, FileUp, Loader2, Send, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const CATEGORIES = [
  { value: 'equipment_purchase', label: '備品購入' },
  { value: 'document_review', label: '書類チェック' },
  { value: 'other', label: 'その他' },
]

export default function NewApprovalRequestPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('equipment_purchase')
  const [customCategory, setCustomCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [approvers, setApprovers] = useState<string[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [requiredSteps, setRequiredSteps] = useState(1)
  const [thresholdRules, setThresholdRules] = useState<any[]>([])
  const [defaultApproverId, setDefaultApproverId] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      // Load organization members
      const res = await fetch('/api/organization/users')
      const json = await res.json()
      if (res.ok) {
        const { data: { user } } = await supabase.auth.getUser()
        // Filter out current user from approver candidates
        setMembers((json.data || []).filter((m: any) => m.id !== user?.id))
      }

      // Load threshold rules and department manager
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('organization_id, department_id')
          .eq('id', user.id)
          .single()
        if (profile) {
          const { data: rules } = await supabase
            .from('approval_threshold_rules')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .order('min_amount', { ascending: true })
          setThresholdRules(rules || [])

          if (profile.department_id) {
            const { data: dept } = await supabase
              .from('departments')
              .select('manager_id')
              .eq('id', profile.department_id)
              .single()
            if (dept?.manager_id && dept.manager_id !== user.id) {
              setDefaultApproverId(dept.manager_id)
              setApprovers([dept.manager_id])
            }
          }
        }
      }
    }
    loadData()
  }, [])

  // Calculate required steps when amount changes
  useEffect(() => {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || thresholdRules.length === 0) {
      setRequiredSteps(1)
      return
    }
    for (const rule of thresholdRules) {
      const minOk = amountNum >= Number(rule.min_amount)
      const maxOk = rule.max_amount == null || amountNum < Number(rule.max_amount)
      if (minOk && maxOk) {
        setRequiredSteps(rule.required_steps)
        return
      }
    }
    setRequiredSteps(1)
  }, [amount, thresholdRules])

  const addApprover = (userId: string) => {
    if (!approvers.includes(userId)) {
      setApprovers([...approvers, userId])
    }
  }

  const removeApprover = (userId: string) => {
    setApprovers(approvers.filter(id => id !== userId))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    const maxSize = 50 * 1024 * 1024
    const oversized = selected.find(f => f.size > maxSize)
    if (oversized) {
      toast.error('ファイルサイズは50MB以下にしてください')
      return
    }
    setFiles([...files, ...selected])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleSubmit = async (action: 'draft' | 'submit') => {
    if (!title.trim()) {
      toast.error('タイトルを入力してください')
      return
    }
    if (category === 'other' && !customCategory.trim()) {
      toast.error('カテゴリ名を入力してください')
      return
    }
    if (action === 'submit' && approvers.length < requiredSteps) {
      toast.error(`この金額には${requiredSteps}段階の承認が必要です。承認者を${requiredSteps}人以上選択してください`)
      return
    }

    setLoading(true)
    try {
      // 1. Create draft
      const createRes = await fetch('/api/approval-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category,
          custom_category: category === 'other' ? customCategory.trim() : null,
          amount: amount ? parseFloat(amount) : null,
        }),
      })

      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson.error)

      const requestId = createJson.data.id

      // 2. Upload attachments
      if (files.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user!.id)
          .single()

        for (const file of files) {
          const timestamp = Date.now()
          const filePath = `${profile!.organization_id}/approval-requests/${requestId}/${timestamp}_${file.name}`

          const { error: uploadError } = await supabase.storage
            .from('approval-files')
            .upload(filePath, file, { cacheControl: '3600', upsert: false })

          if (uploadError) {
            console.error('Upload error:', uploadError)
            continue
          }

          await fetch(`/api/approval-requests/${requestId}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_name: file.name,
              file_path: filePath,
              file_size: file.size,
              content_type: file.type || 'application/octet-stream',
            }),
          })
        }
      }

      // 3. Submit if requested
      if (action === 'submit') {
        const submitRes = await fetch(`/api/approval-requests/${requestId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvers }),
        })

        const submitJson = await submitRes.json()
        if (!submitRes.ok) throw new Error(submitJson.error)

        toast.success('申請を提出しました')
      } else {
        toast.success('下書きを保存しました')
      }

      router.push('/dashboard/approval-requests')
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/approval-requests">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">新規申請</h1>
          <p className="text-muted-foreground">申請内容を入力してください</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>申請内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">タイトル <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              placeholder="申請タイトル"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">カテゴリ <span className="text-red-500">*</span></Label>
            <Select value={category} onValueChange={setCategory} disabled={loading}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {category === 'other' && (
            <div className="space-y-2">
              <Label htmlFor="customCategory">カテゴリ名 <span className="text-red-500">*</span></Label>
              <Input
                id="customCategory"
                placeholder="カテゴリ名を入力"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">金額</Label>
            <Input
              id="amount"
              type="number"
              placeholder="金額（円）"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={loading}
            />
            {amount && (
              <p className="text-xs text-muted-foreground">
                この金額には{requiredSteps}段階の承認が必要です
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">詳細説明</Label>
            <Textarea
              id="description"
              placeholder="申請の詳細を入力"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Approvers */}
      <Card>
        <CardHeader>
          <CardTitle>承認者</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {amount && (
            <p className="text-sm text-muted-foreground">
              {requiredSteps}人以上の承認者を選択してください（上から順に承認されます）
            </p>
          )}

          {/* Selected approvers */}
          {approvers.length > 0 && (
            <div className="space-y-2">
              {approvers.map((id, index) => {
                const member = members.find(m => m.id === id)
                return (
                  <div key={id} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium">{member?.name || '不明'}{id === defaultApproverId && <span className="text-xs text-blue-600 ml-1">(部署長)</span>}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeApprover(id)}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add approver */}
          <Select
            value=""
            onValueChange={addApprover}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="承認者を追加..." />
            </SelectTrigger>
            <SelectContent>
              {members
                .filter(m => !approvers.includes(m.id))
                .map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}{m.department?.name ? ` (${m.department.name})` : ''}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader>
          <CardTitle>添付ファイル</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileUp className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">クリックしてファイルを追加</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            multiple
            disabled={loading}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link href="/dashboard/approval-requests">
          <Button variant="outline" disabled={loading}>キャンセル</Button>
        </Link>
        <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          下書き保存
        </Button>
        <Button onClick={() => handleSubmit('submit')} disabled={loading || approvers.length < requiredSteps}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          提出
        </Button>
      </div>
    </div>
  )
}
