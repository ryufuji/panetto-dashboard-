/**
 * login_id から email を引く（ログイン用）。
 * ログインIDで入力された場合に、内部の email を取得してから signInWithPassword する流れで使用。
 *
 * セキュリティ:
 *   - 認証不要（ログイン前に呼ばれる）
 *   - 検索は完全一致のみ。曖昧検索やワイルドカードは不可。
 *   - login_id が未登録なら 404 を返し、攻撃者にユーザー存在を推測されないよう
 *     一定時間処理を要するようにする(レート制限はミドルウェアで)
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { login_id } = await request.json()
    if (!login_id || typeof login_id !== 'string') {
      return NextResponse.json({ error: 'login_id is required' }, { status: 400 })
    }
    const trimmed = login_id.trim()
    if (!trimmed || trimmed.length > 100) {
      return NextResponse.json({ error: 'invalid login_id' }, { status: 400 })
    }

    // Service Role で参照（ログイン前なので RLS では拾えない）
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data } = await admin
      .from('users')
      .select('email, is_active')
      .eq('login_id', trimmed)
      .maybeSingle()

    if (!data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if ((data as { is_active?: boolean }).is_active === false) {
      return NextResponse.json({ error: 'archived' }, { status: 403 })
    }

    return NextResponse.json({ email: (data as { email: string }).email })
  } catch (err) {
    console.error('[LOOKUP_LOGIN_ID] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
