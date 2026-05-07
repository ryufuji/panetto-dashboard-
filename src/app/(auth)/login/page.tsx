'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // 既にログイン済みなら /dashboard へ。session token が無効な場合(削除等)は
  // 失敗して signOut し、このページに留まる(リダイレクトループ防止)。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (cancelled) return
      if (user && !error) {
        router.replace('/dashboard')
      } else if (error) {
        // 無効化された session が残っている場合は明示的にサインアウトしてクッキーを掃除
        await supabase.auth.signOut().catch(() => {})
      }
    })()
    return () => { cancelled = true }
  }, [supabase, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Building2 className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">業務日報ダッシュボード</CardTitle>
          <CardDescription>メールアドレスとパスワードでログイン</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@panetto.co.jp"
                value={email}
                onChange={(e) => setEmail(e.target.value.replace(/\s/g, ''))}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />ログイン中...</> : 'ログイン'}
            </Button>
            <div className="text-center">
              <a href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                パスワードをお忘れですか？
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
