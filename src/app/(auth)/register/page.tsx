'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const inviteEmail = searchParams.get('email') || ''

  const [email, setEmail] = useState(inviteEmail)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (inviteEmail) {
      setEmail(inviteEmail)
    }
  }, [inviteEmail])

  const validate = (): string | null => {
    if (!email.trim()) return 'メールアドレスを入力してください'
    if (!name.trim()) return '氏名を入力してください'
    if (password.length < 8) return 'パスワードは8文字以上で入力してください'
    if (password !== confirmPassword) return 'パスワードが一致しません'
    return null
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
        },
      })

      if (authError) throw authError

      if (authData.user) {
        const { error: profileError } = await supabase.from('users').insert({
          id: authData.user.id,
          email: email.trim(),
          name: name.trim(),
          role: 'employee',
          organization_id: '00000000-0000-0000-0000-000000000001',
        })

        if (profileError) {
          console.error('プロフィール作成エラー:', profileError)
        }
      }

      setSuccess(true)
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        setError('このメールアドレスは既に登録されています')
      } else {
        setError(err.message || 'アカウントの作成に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12">
          <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">登録完了</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            確認メールを送信しました。メール内のリンクをクリックしてアカウントを有効化してください。
          </p>
          <Link href="/login"><Button>ログイン画面へ</Button></Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Building2 className="h-8 w-8" />
        </div>
        <CardTitle className="text-2xl">アカウント登録</CardTitle>
        <CardDescription>
          {inviteEmail ? '招待されたメールアドレスでアカウントを作成してください' : '新しいアカウントを作成してください'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" type="email" placeholder="email@panetto.co.jp" value={email}
              onChange={(e) => setEmail(e.target.value)} required readOnly={!!inviteEmail}
              className={inviteEmail ? 'bg-muted' : ''} autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">氏名</Label>
            <Input id="name" type="text" placeholder="山田 太郎" value={name}
              onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input id="password" type="password" placeholder="8文字以上" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">パスワード（確認）</Label>
            <Input id="confirmPassword" type="password" placeholder="パスワードを再入力" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500">パスワードが一致しません</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />登録中...</> : 'アカウントを作成'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            既にアカウントをお持ちの方は{' '}
            <Link href="/login" className="text-blue-600 hover:underline">ログイン</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <Suspense fallback={<div className="text-white">読み込み中...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
