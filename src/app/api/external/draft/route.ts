/**
 * GET  /api/external/draft  — 自分の下書き一覧取得
 * POST /api/external/draft  — 下書き作成（同日に下書きが既存なら上書きUPSERT）
 *
 * 認証: Authorization: Bearer <api_token>
 *   - api_token は /dashboard/settings/profile の「API連携」セクションで確認・再生成できます
 *
 * POST リクエストボディ（application/json）:
 * {
 *   "report_date": "2026-06-25",
 *   "title": "6/25 業務日報",
 *   "start_time": "09:00", "end_time": "18:00", "work_hours": 8.0,
 *   "next_day_plan": "明日の予定...",
 *   "tasks": [
 *     {
 *       "title": "タスク名", "description": "詳細",
 *       "estimated_hours": 2.0, "actual_hours": 0,
 *       "progress_rate": 0, "priority": "medium",
 *       "task_status": "未着手", "purpose": "目的", "memo": "備考",
 *       "is_recurring": false, "recurrence_pattern": "daily",
 *       "no_norma": false, "no_due_date": false, "due_date": "2026-06-25",
 *       "target_norma_count": null, "target_norma_amount": null,
 *       "children": [{ "title": "子タスク名", "estimated_hours": 1.0 }]
 *     }
 *   ],
 *   "planned_tasks": [{ "title": "翌日タスク名", "estimated_hours": 1.5 }]
 * }
 *
 * レスポンス: { "ok": true, "report_id": "<UUID>", "created": true|false }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveUserByToken, createExternalClient, insertTasksForReport } from '@/lib/external-api'

/** GET /api/external/draft */
export async function GET(req: NextRequest) {
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー: Authorization ヘッダーに Bearer <api_token> を指定してください' }, { status: 401 })

  const supabase = createExternalClient()
  const { data, error } = await supabase
    .from('reports')
    .select('id, report_date, title, start_time, end_time, work_hours, next_day_plan, updated_at')
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

/** POST /api/external/draft */
export async function POST(req: NextRequest) {
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー: Authorization ヘッダーに Bearer <api_token> を指定してください' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正なJSONです' }, { status: 400 })
  }

  const { report_date, title, start_time, end_time, work_hours, next_day_plan, tasks, planned_tasks } = body

  // フォーマット + 暦日バリデーション
  if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date) || isNaN(Date.parse(report_date))) {
    return NextResponse.json({ error: 'report_date は有効な YYYY-MM-DD 形式で必須です' }, { status: 400 })
  }

  const supabase = createExternalClient()

  // 同日の既存下書きを確認
  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('report_date', report_date)
    .eq('status', 'draft')
    .maybeSingle()

  // 更新可能なフィールドのみ（owner フィールドは更新対象外）
  const mutableFields: Record<string, any> = {
    report_date,
    status: 'draft',
    title: title ?? null,
    start_time: start_time ?? null,
    end_time: end_time ?? null,
    work_hours: work_hours != null ? Number(work_hours) : null,
    next_day_plan: next_day_plan ?? null,
  }

  let reportId: string
  let created: boolean

  if (existing) {
    const { error: upErr } = await supabase.from('reports').update(mutableFields).eq('id', existing.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    reportId = existing.id
    created = false

    if (Array.isArray(tasks) || Array.isArray(planned_tasks)) {
      await Promise.all([
        Array.isArray(tasks) ? supabase.from('report_tasks').delete().eq('report_id', reportId) : Promise.resolve(),
        Array.isArray(planned_tasks) ? supabase.from('report_planned_tasks').delete().eq('report_id', reportId) : Promise.resolve(),
      ])
    }
  } else {
    const { data: newReport, error: insErr } = await supabase
      .from('reports')
      .insert({
        user_id: user.id,
        organization_id: user.organization_id,
        department_id: user.department_id ?? null,
        ...mutableFields,
      })
      .select('id')
      .single()
    if (insErr || !newReport) return NextResponse.json({ error: insErr?.message ?? '作成失敗' }, { status: 500 })
    reportId = newReport.id
    created = true
  }

  if (Array.isArray(tasks) && tasks.length > 0) {
    const err = await insertTasksForReport(supabase, reportId, tasks)
    if (err) return NextResponse.json({ error: `タスクの保存に失敗しました: ${err}` }, { status: 500 })
  }

  if (Array.isArray(planned_tasks) && planned_tasks.length > 0) {
    const { error: plErr } = await supabase.from('report_planned_tasks').insert(
      planned_tasks.map((p: any, idx: number) => ({
        report_id: reportId,
        title: String(p.title || '').trim() || '(無題)',
        estimated_hours: p.estimated_hours != null ? Number(p.estimated_hours) : null,
        order_index: idx,
      }))
    )
    if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, report_id: reportId, created }, { status: created ? 201 : 200 })
}
