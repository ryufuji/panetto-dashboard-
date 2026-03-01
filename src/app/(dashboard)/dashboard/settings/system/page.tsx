'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Building2, FileText, CheckSquare, Shield, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface OrgSettings {
  report_deadline_hour?: number
  report_require_title?: boolean
  report_require_work_hours?: boolean
  report_require_next_day_plan?: boolean
  approval_auto_assign?: boolean
  approval_deadline_days?: number
  security_min_password_length?: number
  security_session_timeout_hours?: number
}

const DEFAULT_SETTINGS: OrgSettings = {
  report_deadline_hour: 10,
  report_require_title: true,
  report_require_work_hours: false,
  report_require_next_day_plan: false,
  approval_auto_assign: true,
  approval_deadline_days: 3,
  security_min_password_length: 6,
  security_session_timeout_hours: 24,
}

export default function SystemSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<any>(null)

  // Organization info
  const [orgName, setOrgName] = useState('')
  const [orgAddress, setOrgAddress] = useState('')
  const [orgPhone, setOrgPhone] = useState('')
  const [orgEmail, setOrgEmail] = useState('')
  const [orgWebsite, setOrgWebsite] = useState('')

  // Settings
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/organization/settings')
      const json = await res.json()
      if (json.data) {
        setOrg(json.data)
        setOrgName(json.data.name || '')
        setOrgAddress(json.data.address || '')
        setOrgPhone(json.data.phone || '')
        setOrgEmail(json.data.email || '')
        setOrgWebsite(json.data.website || '')
        setSettings({ ...DEFAULT_SETTINGS, ...(json.data.settings || {}) })
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSaveOrg = async () => {
    setSaving(true)
    const res = await fetch('/api/organization/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: orgName,
        address: orgAddress,
        phone: orgPhone,
        email: orgEmail,
        website: orgWebsite,
      }),
    })
    if (res.ok) {
      toast.success('組織情報を更新しました')
    } else {
      const json = await res.json()
      toast.error(json.error || '更新に失敗しました')
    }
    setSaving(false)
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    const res = await fetch('/api/organization/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
    if (res.ok) {
      toast.success('設定を更新しました')
    } else {
      const json = await res.json()
      toast.error(json.error || '更新に失敗しました')
    }
    setSaving(false)
  }

  const updateSetting = <K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">システム設定</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">システム設定</h1>
        <p className="text-muted-foreground">組織全体の設定を管理します</p>
      </div>

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization" className="gap-2">
            <Building2 className="h-4 w-4" />
            組織情報
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            日報設定
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-2">
            <CheckSquare className="h-4 w-4" />
            承認設定
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            セキュリティ
          </TabsTrigger>
        </TabsList>

        {/* Organization Info */}
        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">組織基本情報</CardTitle>
              <CardDescription>会社名や連絡先を管理します</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>組織名</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>住所</Label>
                <Input value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} placeholder="例: 東京都渋谷区..." />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>電話番号</Label>
                  <Input value={orgPhone} onChange={(e) => setOrgPhone(e.target.value)} placeholder="例: 03-1234-5678" />
                </div>
                <div className="space-y-2">
                  <Label>メールアドレス</Label>
                  <Input type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} placeholder="例: info@panetto.co.jp" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Webサイト</Label>
                <Input value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="例: https://panetto.co.jp" />
              </div>
              <Separator />
              <Button onClick={handleSaveOrg} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Report Settings */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">日報設定</CardTitle>
              <CardDescription>日報の提出ルールを設定します</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>提出締切時間</Label>
                <Select
                  value={String(settings.report_deadline_hour)}
                  onValueChange={(v) => updateSetting('report_deadline_hour', Number(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>翌日 {String(i).padStart(2, '0')}:00 まで</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">日報の提出期限を設定します</p>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-sm font-semibold">必須フィールド</Label>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">タイトル</p>
                    <p className="text-xs text-muted-foreground">日報のタイトル入力を必須にする</p>
                  </div>
                  <Switch
                    checked={settings.report_require_title}
                    onCheckedChange={(v) => updateSetting('report_require_title', v)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">作業時間</p>
                    <p className="text-xs text-muted-foreground">作業時間の入力を必須にする</p>
                  </div>
                  <Switch
                    checked={settings.report_require_work_hours}
                    onCheckedChange={(v) => updateSetting('report_require_work_hours', v)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">翌日の予定</p>
                    <p className="text-xs text-muted-foreground">翌日の予定入力を必須にする</p>
                  </div>
                  <Switch
                    checked={settings.report_require_next_day_plan}
                    onCheckedChange={(v) => updateSetting('report_require_next_day_plan', v)}
                  />
                </div>
              </div>

              <Separator />
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approval Settings */}
        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">承認ワークフロー設定</CardTitle>
              <CardDescription>日報の確認フローを設定します</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">部署長への自動割当</p>
                  <p className="text-xs text-muted-foreground">日報提出時に部署長へ確認依頼を自動で割り当てる</p>
                </div>
                <Switch
                  checked={settings.approval_auto_assign}
                  onCheckedChange={(v) => updateSetting('approval_auto_assign', v)}
                />
              </div>

              <div className="space-y-2">
                <Label>承認期限</Label>
                <Select
                  value={String(settings.approval_deadline_days)}
                  onValueChange={(v) => updateSetting('approval_deadline_days', Number(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1営業日</SelectItem>
                    <SelectItem value="2">2営業日</SelectItem>
                    <SelectItem value="3">3営業日</SelectItem>
                    <SelectItem value="5">5営業日</SelectItem>
                    <SelectItem value="7">7営業日</SelectItem>
                    <SelectItem value="0">期限なし</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">提出から承認までの期限を設定します</p>
              </div>

              <Separator />
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">セキュリティ設定</CardTitle>
              <CardDescription>パスワードポリシーやセッション設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>パスワード最小文字数</Label>
                <Select
                  value={String(settings.security_min_password_length)}
                  onValueChange={(v) => updateSetting('security_min_password_length', Number(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6文字</SelectItem>
                    <SelectItem value="8">8文字</SelectItem>
                    <SelectItem value="10">10文字</SelectItem>
                    <SelectItem value="12">12文字</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>セッションタイムアウト</Label>
                <Select
                  value={String(settings.security_session_timeout_hours)}
                  onValueChange={(v) => updateSetting('security_session_timeout_hours', Number(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1時間</SelectItem>
                    <SelectItem value="4">4時間</SelectItem>
                    <SelectItem value="8">8時間</SelectItem>
                    <SelectItem value="24">24時間</SelectItem>
                    <SelectItem value="72">72時間</SelectItem>
                    <SelectItem value="168">1週間</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">操作がない場合に自動ログアウトするまでの時間</p>
              </div>

              <Separator />
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
