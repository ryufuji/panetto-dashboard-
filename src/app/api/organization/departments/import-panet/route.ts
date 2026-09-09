/**
 * POST /api/organization/departments/import-panet — PANET の部署を一括取込（管理者のみ）
 *
 * PANET のユーザー一覧（department 文字列）から
 *   1. まだ無い部署を departments に作成（code は部署名と同じ）
 *   2. ダッシュボードのユーザーに department_id を割り当て（panet_user_id → email の順で照合）
 *
 * body: { dryRun: boolean }
 *   dryRun=true  : 何が作られ・誰に割り当てられるかを返すだけ（DB 変更なし）
 *   dryRun=false : 実行
 *
 * 対象は PANET 所属（affiliation に PANET を含む）かつ未退職で department が入っているユーザー。
 * 既に同じ部署が付いているユーザーは対象外。別の部署が付いている場合は PANET の値で上書きする。
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { fetchPanetUsers } from '@/lib/panet'

function isPanetAffiliation(affiliation?: string | null): boolean {
  if (!affiliation) return false
  return /panet/i.test(affiliation)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role, organization_id').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
  const orgId = me.organization_id as string

  let dryRun = true
  try { dryRun = (await request.json())?.dryRun !== false } catch { /* body 無しは dryRun 扱い */ }

  const fetched = await fetchPanetUsers()
  if ('error' in fetched) return NextResponse.json({ error: fetched.error }, { status: 502 })

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const [{ data: existingDepts }, { data: dbUsers }] = await Promise.all([
    admin.from('departments').select('id, name, is_active').eq('organization_id', orgId),
    admin.from('users').select('id, email, name, panet_user_id, department_id').eq('organization_id', orgId),
  ])
  const deptByName = new Map((existingDepts || []).map(d => [d.name.trim(), d]))
  const byPanetId = new Map((dbUsers || []).filter(u => u.panet_user_id != null).map(u => [u.panet_user_id as number, u]))
  const byEmail = new Map((dbUsers || []).map(u => [String(u.email).toLowerCase(), u]))

  // 取込対象の PANET ユーザー
  const targets = fetched.users.filter(u =>
    isPanetAffiliation(u.affiliation) &&
    !(u.archived === true || u.archived === 1) &&
    !!(u.department && u.department.trim())
  )

  const departmentsToCreate = [...new Set(targets.map(u => u.department!.trim()))].filter(n => !deptByName.has(n))
  const assignments: { user_id: string; name: string; email: string; department: string; previous: string | null }[] = []
  const unmatched: { email: string; display_name: string; department: string }[] = []
  const deptIdByName = new Map((existingDepts || []).map(d => [d.name.trim(), d.id]))

  for (const pu of targets) {
    const dept = pu.department!.trim()
    const local = byPanetId.get(pu.id) || byEmail.get(String(pu.email).toLowerCase())
    if (!local) { unmatched.push({ email: pu.email, display_name: pu.display_name, department: dept }); continue }
    const targetId = deptIdByName.get(dept) // 新規作成分は実行時に埋まる
    if (targetId && local.department_id === targetId) continue // 既に同じ部署
    const prevName = local.department_id ? (existingDepts || []).find(d => d.id === local.department_id)?.name ?? null : null
    assignments.push({ user_id: local.id, name: local.name, email: local.email, department: dept, previous: prevName })
  }

  const summary = {
    panet_users_total: fetched.users.length,
    targets: targets.length,
    departments_to_create: departmentsToCreate,
    assignments,
    unmatched,
    skipped_no_department: fetched.users.filter(u => isPanetAffiliation(u.affiliation) && !(u.archived === true || u.archived === 1) && !(u.department && u.department.trim())).length,
  }
  if (dryRun) return NextResponse.json({ dryRun: true, ...summary })

  // ── 実行 ──
  if (departmentsToCreate.length > 0) {
    const base = (existingDepts || []).length
    const { data: created, error } = await admin
      .from('departments')
      .insert(departmentsToCreate.map((name, i) => ({ organization_id: orgId, name, code: name, order_index: base + i, is_active: true })))
      .select('id, name')
    if (error) return NextResponse.json({ error: `部署の作成に失敗しました: ${error.message}` }, { status: 500 })
    for (const d of created || []) deptIdByName.set(d.name.trim(), d.id)
  }

  let assigned = 0
  const failures: { email: string; error: string }[] = []
  for (const a of assignments) {
    const deptId = deptIdByName.get(a.department)
    if (!deptId) { failures.push({ email: a.email, error: `部署 ${a.department} の ID を解決できません` }); continue }
    const { error } = await admin.from('users').update({ department_id: deptId }).eq('id', a.user_id)
    if (error) failures.push({ email: a.email, error: error.message }); else assigned++
  }

  return NextResponse.json({ dryRun: false, ...summary, created_departments: departmentsToCreate.length, assigned, failures })
}
