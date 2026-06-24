/**
 * GET  /api/external/token — 自分のAPIトークンを取得
 * POST /api/external/token — APIトークンを再生成（古いトークンは無効化）
 * 認証: Supabase セッション（ブラウザログイン済みユーザーのみ）
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const { data } = await supabase.from('users').select('api_token').eq('id', user.id).single()
  return NextResponse.json({ api_token: data?.api_token ?? null })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const { data, error } = await supabase
    .from('users')
    .update({ api_token: crypto.randomUUID() })
    .eq('id', user.id)
    .select('api_token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ api_token: data?.api_token })
}
