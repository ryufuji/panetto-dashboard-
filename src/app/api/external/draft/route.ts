/**
 * 外部自動化（GAS / Claude Code）からの下書き投入 API
 *
 * 認証: Authorization: Bearer <api_token>
 *   - api_token は /dashboard/settings/profile の「API連携」セクションで確認・再生成できます
 *
 * GET  /api/external/draft          - 自分の下書き一覧取得
 * POST /api/external/draft          - 下書き作成（同日に下書きが既存なら上書きUPSERT）
 *
 * POST リクエストボディ（application/json）:
 * {
 *   "report_date": "2026-06-25",          // 必須: YYYY-MM-DD
 *   "title": "6/25 業務日報",             // 任意
 *   "start_time": "09:00",               // 任意: HH:MM
 *   "end_time": "18:00",                 // 任意: HH:MM
 *   "work_hours": 8.0,                   // 任意: 数値
 *   "next_day_plan": "明日の予定...",     // 任意
 *   "tasks": [                           // 任意: 親タスクの配列
 *     {
 *       "title": "タスク名",             // 必須
 *       "description": "詳細",           // 任意
 *       "estimated_hours": 2.0,          // 任意
 *       "progress_rate": 0,              // 任意: 0-100
 *       "priority": "medium",            // 任意: high / medium / low
 *       "task_status": "未着手",         // 任意: 未着手/進行中/完了/保留
 *       "purpose": "目的",               // 任意
 *       "memo": "備考",                  // 任意
 *       "is_recurring": false,           // 任意: 定期タスクフラグ
 *       "recurrence_pattern": "daily",   // 任意: daily/weekly/biweekly/monthly
 *       "children": [                    // 任意: 子タスクの配列
 *         {
 *           "title": "子タスク名",
 *           "estimated_hours": 1.0,
 *           "progress_rate": 0,
 *           "priority": "medium"
 *         }
 *       ]
 *     }
 *   ],
 *   "planned_tasks": [                   // 任意: 翌日以降の予定
 *     {
 *       "title": "翌日タスク名",
 *       "estimated_hours": 1.5
 *     }
 *   ]
 * }
 *
 * レスポンス:
 * { "ok": true, "report_id": "<UUID>", "created": true|false }
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/** Bearer トークンからユーザーを解決する */
async function resolveUserByToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null

  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, organization_id, department_id')
    .eq('api_token', token)
    .maybeSingle()
  return user ?? null
}

/** GET /api/external/draft — 自分の下書き一覧 */
export async function GET(req: NextRequest) {
  const user = await resolveUserByToken(req)
  if (!user) return NextResponse.json({ error: '認証エラー: Authorization ヘッダーに Bearer <api_token> を指定してください' }, { status: 401 })

  const supabase = await createClient()
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

/** POST /api/external/draft — 下書きを作成 or 同日を上書き */
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
  if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) {
    return NextResponse.json({ error: 'report_date は YYYY-MM-DD 形式で必須です' }, { status: 400 })
  }

  const supabase = await createClient()

  // 同日の既存下書きを確認
  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('report_date', report_date)
    .eq('status', 'draft')
    .maybeSingle()

  const reportPayload: Record<string, any> = {
    user_id: user.id,
    organization_id: user.organization_id,
    department_id: user.department_id ?? null,
    report_date,
    status: 'draft',   // 常にdraft固定
    title: title ?? null,
    start_time: start_time ?? null,
    end_time: end_time ?? null,
    work_hours: work_hours != null ? Number(work_hours) : null,
    next_day_plan: next_day_plan ?? null,
  }

  let reportId: string
  let created: boolean

  if (existing) {
    // 既存下書きを上書き
    const { error: upErr } = await supabase.from('reports').update(reportPayload).eq('id', existing.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    reportId = existing.id
    created = false

    // タスクが指定された場合は既存タスクを全削除して再投入
    if (Array.isArray(tasks)) {
      await supabase.from('report_tasks').delete().eq('report_id', reportId)
    }
    if (Array.isArray(planned_tasks)) {
      await supabase.from('report_planned_tasks').delete().eq('report_id', reportId)
    }
  } else {
    // 新規作成
    const { data: newReport, error: insErr } = await supabase.from('reports').insert(reportPayload).select('id').single()
    if (insErr || !newReport) return NextResponse.json({ error: insErr?.message ?? '作成失敗' }, { status: 500 })
    reportId = newReport.id
    created = true
  }

  // タスクを投入
  if (Array.isArray(tasks) && tasks.length > 0) {
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]
      const { data: parentTask } = await supabase.from('report_tasks').insert({
        report_id: reportId,
        title: String(t.title || '').trim() || '(無題)',
        description: t.description ?? null,
        estimated_hours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
        actual_hours: t.actual_hours != null ? Number(t.actual_hours) : null,
        progress_rate: t.progress_rate != null ? Math.min(100, Math.max(0, Number(t.progress_rate))) : 0,
        priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
        order_index: i,
        purpose: t.purpose ?? null,
        memo: t.memo ?? null,
        task_status: t.task_status ?? '未着手',
        is_recurring: !!t.is_recurring,
        recurrence_pattern: t.is_recurring ? (t.recurrence_pattern ?? 'daily') : null,
        no_norma: !!t.no_norma,
        no_due_date: !!t.no_due_date,
        due_date: t.due_date ?? null,
        target_norma_count: t.target_norma_count != null ? Number(t.target_norma_count) : null,
        target_norma_amount: t.target_norma_amount != null ? Number(t.target_norma_amount) : null,
      }).select('id').single()

      // 子タスク
      if (parentTask && Array.isArray(t.children)) {
        for (let j = 0; j < t.children.length; j++) {
          const c = t.children[j]
          await supabase.from('report_tasks').insert({
            report_id: reportId,
            parent_task_id: parentTask.id,
            title: String(c.title || '').trim() || '(無題)',
            description: c.description ?? null,
            estimated_hours: c.estimated_hours != null ? Number(c.estimated_hours) : null,
            progress_rate: c.progress_rate != null ? Math.min(100, Math.max(0, Number(c.progress_rate))) : 0,
            priority: ['high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
            order_index: j,
            task_status: c.task_status ?? '未着手',
            memo: c.memo ?? null,
          })
        }
      }
    }
  }

  // 翌日以降の予定を投入
  if (Array.isArray(planned_tasks) && planned_tasks.length > 0) {
    await supabase.from('report_planned_tasks').insert(
      planned_tasks.map((p: any, idx: number) => ({
        report_id: reportId,
        title: String(p.title || '').trim() || '(無題)',
        estimated_hours: p.estimated_hours != null ? Number(p.estimated_hours) : null,
        order_index: idx,
      }))
    )
  }

  return NextResponse.json({ ok: true, report_id: reportId, created }, { status: created ? 201 : 200 })
}
