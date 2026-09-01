'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Save, Camera, Loader2, Copy, RefreshCw, KeyRound, Lock } from 'lucide-react'
import { toast } from 'sonner'

export default function ProfilePage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [apiToken, setApiToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data } = await supabase.from('users').select('*, department:departments!users_department_id_fkey(name), office:offices!users_office_id_fkey(name)').eq('id', authUser.id).single()
      if (data) { setUser(data); setName(data.name); setPhone(data.phone || ''); setApiToken(data.api_token ?? null) }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setLoading(true)
    const { error } = await supabase.from('users').update({ name, phone: phone || null }).eq('id', user.id)
    if (error) { toast.error('更新に失敗しました') }
    else { toast.success('プロフィールを更新しました') }
    setLoading(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('ファイルサイズは5MB以下にしてください')
      return
    }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error('アップロードに失敗しました')
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatar_url = urlData.publicUrl

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url })
      .eq('id', user.id)

    if (updateError) {
      toast.error('プロフィール更新に失敗しました')
    } else {
      setUser({ ...user, avatar_url })
      toast.success('プロフィール写真を更新しました')
    }
    setUploading(false)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast.error('パスワードは6文字以上で入力してください')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('パスワードが一致しません')
      return
    }
    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast.error('パスワードの変更に失敗しました')
    } else {
      toast.success('パスワードを変更しました')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordLoading(false)
  }

  const regenerateToken = async () => {
    if (!confirm('APIトークンを再生成すると、現在のトークンは無効になります。続けますか？')) return
    setTokenLoading(true)
    try {
      const res = await fetch('/api/external/token', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setApiToken(json.api_token)
      setShowToken(true)
      toast.success('APIトークンを再生成しました')
    } catch (e: any) {
      toast.error(e.message || '再生成に失敗しました')
    } finally {
      setTokenLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">プロフィール設定</h1>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="h-16 w-16">
                {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                <AvatarFallback className="text-xl bg-blue-100 text-blue-700">{user.name?.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading
                  ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                  : <Camera className="h-5 w-5 text-white" />
                }
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div>
              <p className="font-semibold text-lg">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">{user.department?.name} | {user.office?.name}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>氏名</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>電話番号</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>社員番号</Label><Input value={user.employee_number || ''} disabled /></div>
            <div className="space-y-2"><Label>役職</Label><Input value={user.position || ''} disabled /></div>
          </div>
          <Button onClick={handleSave} disabled={loading}><Save className="mr-2 h-4 w-4" />保存</Button>
        </CardContent>
      </Card>

      {/* パスワード変更 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />パスワード変更
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>新しいパスワード（6文字以上）</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="新しいパスワード"
              />
            </div>
            <div className="space-y-2">
              <Label>新しいパスワード（確認）</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="もう一度入力"
              />
            </div>
          </div>
          <Button onClick={handlePasswordChange} disabled={passwordLoading || !newPassword || !confirmPassword}>
            {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            パスワードを変更する
          </Button>
        </CardContent>
      </Card>

      {/* API連携トークン */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />API連携トークン
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            GAS・Claude Codeなどの外部自動化から日報の下書きを自動投入するためのトークンです。
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>
            ヘッダーで
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/external/draft</code>
            を呼び出します。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded border bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 overflow-auto">
              {showToken ? (apiToken ?? '—') : (apiToken ? '•'.repeat(36) : '—')}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowToken(v => !v)}
              disabled={!apiToken}
            >
              {showToken ? '隠す' : '表示'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!apiToken || !showToken}
              onClick={() => {
                if (apiToken) { navigator.clipboard.writeText(apiToken); toast.success('コピーしました') }
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={regenerateToken} disabled={tokenLoading}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${tokenLoading ? 'animate-spin' : ''}`} />
              トークンを再生成
            </Button>
            <p className="text-xs text-muted-foreground">再生成すると旧トークンは即時無効になります</p>
          </div>
          <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p className="font-medium text-slate-700">利用例（GAS / curl）</p>
            <pre className="whitespace-pre-wrap break-all">{`curl -X POST https://panetto-dashboard.vercel.app/api/external/draft \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "report_date": "2026-06-25",
    "title": "自動生成 日報",
    "tasks": [
      { "title": "業務A", "estimated_hours": 2, "progress_rate": 0 }
    ]
  }'`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
