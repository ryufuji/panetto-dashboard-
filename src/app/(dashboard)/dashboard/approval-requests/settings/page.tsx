'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface ThresholdRule {
  id?: string
  min_amount: string
  max_amount: string
  required_steps: string
}

export default function ApprovalRequestSettingsPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState<ThresholdRule[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id, role')
        .eq('id', user.id)
        .single()

      if (!profile) return

      setOrgId(profile.organization_id)
      setUserRole(profile.role)

      const { data: existingRules } = await supabase
        .from('approval_threshold_rules')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('min_amount', { ascending: true })

      if (existingRules && existingRules.length > 0) {
        setRules(existingRules.map(r => ({
          id: r.id,
          min_amount: String(r.min_amount),
          max_amount: r.max_amount != null ? String(r.max_amount) : '',
          required_steps: String(r.required_steps),
        })))
      } else {
        // Default rules
        setRules([
          { min_amount: '0', max_amount: '100000', required_steps: '1' },
          { min_amount: '100000', max_amount: '1000000', required_steps: '2' },
          { min_amount: '1000000', max_amount: '', required_steps: '3' },
        ])
      }

      setLoading(false)
    }
    loadData()
  }, [])

  const addRule = () => {
    setRules([...rules, { min_amount: '', max_amount: '', required_steps: '1' }])
  }

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index))
  }

  const updateRule = (index: number, field: keyof ThresholdRule, value: string) => {
    const updated = [...rules]
    updated[index] = { ...updated[index], [field]: value }
    setRules(updated)
  }

  const handleSave = async () => {
    if (!orgId) return

    // Validate
    for (const rule of rules) {
      if (rule.min_amount === '' || rule.required_steps === '') {
        toast.error('下限金額と必要承認数は必須です')
        return
      }
      const steps = parseInt(rule.required_steps)
      if (isNaN(steps) || steps < 1) {
        toast.error('必要承認数は1以上の整数を入力してください')
        return
      }
    }

    setSaving(true)
    try {
      // Delete all existing rules for this org
      const { error: deleteError } = await supabase
        .from('approval_threshold_rules')
        .delete()
        .eq('organization_id', orgId)

      if (deleteError) throw deleteError

      // Insert new rules
      const newRules = rules.map(r => ({
        organization_id: orgId,
        min_amount: parseFloat(r.min_amount) || 0,
        max_amount: r.max_amount ? parseFloat(r.max_amount) : null,
        required_steps: parseInt(r.required_steps) || 1,
      }))

      const { error: insertError } = await supabase
        .from('approval_threshold_rules')
        .insert(newRules)

      if (insertError) throw insertError

      toast.success('設定を保存しました')
    } catch (err: any) {
      toast.error(err.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (userRole !== 'admin') {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/approval-requests">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <p className="font-medium text-lg">アクセス権限がありません</p>
            <p className="text-sm text-muted-foreground">この設定は管理者のみ変更できます</p>
          </CardContent>
        </Card>
      </div>
    )
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
          <h1 className="text-3xl font-bold tracking-tight">承認設定</h1>
          <p className="text-muted-foreground">金額に応じた承認ステップ数を設定します</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>金額閾値ルール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            申請金額に応じて必要な承認ステップ数を設定します。上限が空欄の場合、上限なしとなります。
          </p>

          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div key={index} className="flex items-end gap-3 rounded-lg border p-4">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">下限金額（円）</Label>
                  <Input
                    type="number"
                    value={rule.min_amount}
                    onChange={e => updateRule(index, 'min_amount', e.target.value)}
                    placeholder="0"
                    disabled={saving}
                  />
                </div>
                <span className="pb-2 text-muted-foreground">〜</span>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">上限金額（円）</Label>
                  <Input
                    type="number"
                    value={rule.max_amount}
                    onChange={e => updateRule(index, 'max_amount', e.target.value)}
                    placeholder="上限なし"
                    disabled={saving}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">承認数</Label>
                  <Input
                    type="number"
                    min="1"
                    value={rule.required_steps}
                    onChange={e => updateRule(index, 'required_steps', e.target.value)}
                    disabled={saving}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(index)}
                  disabled={saving || rules.length <= 1}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={addRule} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />ルールを追加
          </Button>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
