/**
 * panet (社内ポータル) からのユーザー連携 Webhook
 *
 * 認証:
 *   Authorization: Bearer <PANET_WEBHOOK_SECRET>
 *
 * イベント:
 *   user.created  : 新規登録 → auth.users + public.users 作成（panet_user_id で UPSERT）
 *   user.updated  : 情報更新 → public.users 更新
 *   user.archived : 退職処理 → is_active=false + auth banned (24h)
 *
 * payload 例:
 *   {
 *     "event": "user.created",
 *     "timestamp": "2026-05-07T12:00:00Z",
 *     "user": {
 *       "id": 123, "email": "...", "display_name": "...",
 *       "department": "...", "position": "...", "area": "...",
 *       "employment_type": "...", "join_date": "...", "role": "employee",
 *       "archived": false,
 *       "dashboard_login_id": "yamada-taro",
 *       "dashboard_initial_password": "panet-9k4mx2"
 *     }
 *   }
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const PANETTO_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

interface PanetUser {
  id: number
  email: string
  display_name: string
  department?: string | null
  position?: string | null
  area?: string | null
  employment_type?: string | null
  join_date?: string | null
  birth_date?: string | null
  role?: 'admin' | 'employee'
  archived?: boolean | number
  dashboard_login_id?: string
  dashboard_initial_password?: string
}

// area から拠点(office) を推定
async function resolveOfficeId(admin: ReturnType<typeof createClient>, area?: string | null): Promise<string | null> {
  if (!area) return null
  const a = area.toLowerCase()
  let code: string | null = null
  if (a.includes('札幌') || a.includes('sapporo')) code = 'SAPPORO'
  else if (a.includes('福岡') || a.includes('fukuoka')) code = 'FUKUOKA'
  else code = 'TOKYO' // デフォルトは東京
  const { data } = await admin.from('offices').select('id').eq('organization_id', PANETTO_ORG_ID).eq('code', code).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.id || null
}

// department 名から部署IDを取得（無ければ NULL）
async function resolveDepartmentId(admin: ReturnType<typeof createClient>, name?: string | null): Promise<string | null> {
  if (!name) return null
  const { data } = await admin.from('departments').select('id').eq('organization_id', PANETTO_ORG_ID).eq('name', name).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.id || null
}

export async function POST(request: NextRequest) {
  // ── 認証 ──
  const auth = request.headers.get('authorization')
  const expected = process.env.PANET_WEBHOOK_SECRET
  if (!expected) {
    console.error('[PANET_WEBHOOK] PANET_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { event: string; user: PanetUser }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { event, user: pu } = body
  if (!event || !pu?.id) {
    return NextResponse.json({ error: 'event and user.id are required' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  try {
    // ── 既存レコード検索 (panet_user_id で UPSERT 判定) ──
    const { data: existing } = await admin
      .from('users')
      .select('id, email, login_id')
      .eq('panet_user_id', pu.id)
      .maybeSingle()

    // ── event=archived: 退職処理 ──
    if (event === 'user.archived') {
      if (!existing) {
        return NextResponse.json({ skipped: 'not_found' })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (existing as any).id
      await admin.from('users').update({ is_active: false }).eq('id', userId)
      // 認証側もBANしてログイン不可に
      await admin.auth.admin.updateUserById(userId, { ban_duration: '876600h' /* 100年 */ }).catch(() => {})
      return NextResponse.json({ ok: true, action: 'archived', user_id: userId })
    }

    // ── 共通フィールドの解決 ──
    const officeId = await resolveOfficeId(admin, pu.area)
    const departmentId = await resolveDepartmentId(admin, pu.department)
    const sbRole = pu.role === 'admin' ? 'admin' : 'employee'
    const isArchived = pu.archived === true || pu.archived === 1

    if (existing) {
      // ── UPDATE ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (existing as any).id
      const { error: updErr } = await admin.from('users').update({
        email: pu.email,
        name: pu.display_name,
        department_id: departmentId,
        office_id: officeId,
        position: pu.position || null,
        area: pu.area || null,
        employment_type: pu.employment_type || null,
        login_id: pu.dashboard_login_id || null,
        role: sbRole,
        is_active: !isArchived,
        hire_date: pu.join_date || null,
      }).eq('id', userId)
      if (updErr) {
        console.error('[PANET_WEBHOOK] update users error:', updErr.message)
        return NextResponse.json({ error: updErr.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, action: 'updated', user_id: userId })
    }

    // ── 新規作成 (auth.users + public.users) ──
    if (!pu.dashboard_initial_password) {
      return NextResponse.json({ error: 'dashboard_initial_password is required for new user' }, { status: 400 })
    }

    // メールが空なら合成: <login_id>@panet.local
    const authEmail = pu.email || (pu.dashboard_login_id ? `${pu.dashboard_login_id}@panet.local` : null)
    if (!authEmail) {
      return NextResponse.json({ error: 'email or dashboard_login_id is required' }, { status: 400 })
    }

    // login_id 重複時はサフィックス付与
    let loginId = pu.dashboard_login_id || null
    if (loginId) {
      let suffix = 0
      let candidate = loginId
      while (true) {
        const { data: dup } = await admin.from('users').select('id').eq('login_id', candidate).maybeSingle()
        if (!dup) break
        suffix++
        candidate = `${loginId}-${suffix}`
        if (suffix > 99) { candidate = `${loginId}-${pu.id}`; break }
      }
      loginId = candidate
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: pu.dashboard_initial_password,
      email_confirm: true,
      user_metadata: { name: pu.display_name, panet_user_id: pu.id },
    })
    if (createErr || !created.user) {
      console.error('[PANET_WEBHOOK] auth.admin.createUser error:', createErr?.message)
      return NextResponse.json({ error: createErr?.message || 'auth user creation failed' }, { status: 500 })
    }
    const newAuthUserId = created.user.id

    const { error: insErr } = await admin.from('users').insert({
      id: newAuthUserId,
      organization_id: PANETTO_ORG_ID,
      email: authEmail,
      name: pu.display_name,
      department_id: departmentId,
      office_id: officeId,
      position: pu.position || null,
      area: pu.area || null,
      employment_type: pu.employment_type || null,
      login_id: loginId,
      panet_user_id: pu.id,
      role: sbRole,
      is_active: !isArchived,
      hire_date: pu.join_date || null,
      dashboard_password_changed: false,
    })
    if (insErr) {
      // 失敗時は auth user も削除してロールバック
      await admin.auth.admin.deleteUser(newAuthUserId).catch(() => {})
      console.error('[PANET_WEBHOOK] insert public.users error:', insErr.message)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      action: 'created',
      user_id: newAuthUserId,
      login_id: loginId,
    })
  } catch (err) {
    console.error('[PANET_WEBHOOK] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
