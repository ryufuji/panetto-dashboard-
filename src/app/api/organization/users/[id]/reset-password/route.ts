/**
 * 管理者が対象ユーザーのパスワードを直接設定する。
 *
 * パスワード再設定メールは本人のメールアドレスに届く必要があるが、PANET 側に
 * メールアドレスが登録されていないユーザーは `{ログインID}@panet.local` という
 * 実在しないアドレスで作られるため（api/webhooks/panet-users）、メールでは復旧できない。
 * そうした人を管理者が救えるようにする。
 *
 * 新しいパスワードは画面に1度だけ表示し、ここでは保存もログ出力もしない。
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const MIN_PASSWORD_LENGTH = 8

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetUserId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }

    const { data: me } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()
    if (me?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const { password } = await request.json().catch(() => ({ password: undefined }))
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` },
        { status: 400 },
      )
    }

    // 他の組織の人を操作できないようにする
    const { data: target } = await supabase
      .from('users')
      .select('id, name, organization_id')
      .eq('id', targetUserId)
      .single()
    if (!target || target.organization_id !== me.organization_id) {
      return NextResponse.json({ error: '対象の社員が見つかりません' }, { status: 404 })
    }

    const adminClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await adminClient.auth.admin.updateUserById(targetUserId, { password })
    if (error) {
      return NextResponse.json({ error: `パスワードを変更できませんでした: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, name: target.name })
  } catch {
    return NextResponse.json({ error: 'パスワードを変更できませんでした' }, { status: 500 })
  }
}
