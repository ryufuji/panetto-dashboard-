/**
 * 外部APIトークン認証ルート共通ヘルパー
 * RLSをバイパスするためサービスロールクライアントを使用する。
 * このファイルは /api/external/* ルートのみからインポートすること。
 */
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/** Bearer トークンからユーザーを解決する（RLSバイパス済み） */
export async function resolveUserByToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const supabase = adminClient()
  const { data: user } = await supabase
    .from('users')
    .select('id, organization_id, department_id')
    .eq('api_token', token)
    .maybeSingle()
  return user ?? null
}

/** サービスロールクライアントを生成して返す */
export function createExternalClient() {
  return adminClient()
}

type TaskInput = {
  title?: string
  description?: string
  estimated_hours?: number | null
  actual_hours?: number | null
  progress_rate?: number
  priority?: string
  task_status?: string
  purpose?: string
  memo?: string
  is_recurring?: boolean
  recurrence_pattern?: string
  no_norma?: boolean
  no_due_date?: boolean
  due_date?: string | null
  target_norma_count?: number | null
  target_norma_amount?: number | null
  children?: TaskInput[]
}

/**
 * タスク配列をDBに挿入する。
 * 失敗時はエラーメッセージ文字列を返す（呼び出し側で500を返すこと）。
 * 子タスクは同一親の分を一括挿入してラウンドトリップを削減する。
 */
export async function insertTasksForReport(
  supabase: ReturnType<typeof adminClient>,
  reportId: string,
  tasks: TaskInput[]
): Promise<string | null> {
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    const { data: parentTask, error: ptErr } = await supabase
      .from('report_tasks')
      .insert({
        report_id: reportId,
        title: String(t.title || '').trim() || '(無題)',
        description: t.description ?? null,
        estimated_hours: t.estimated_hours != null ? Number(t.estimated_hours) : null,
        actual_hours: t.actual_hours != null ? Number(t.actual_hours) : null,
        progress_rate: t.progress_rate != null ? Math.min(100, Math.max(0, Number(t.progress_rate))) : 0,
        priority: ['high', 'medium', 'low'].includes(t.priority ?? '') ? t.priority : 'medium',
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
      })
      .select('id')
      .single()

    if (ptErr || !parentTask) return ptErr?.message ?? 'タスクの挿入に失敗しました'

    if (Array.isArray(t.children) && t.children.length > 0) {
      const { error: childErr } = await supabase.from('report_tasks').insert(
        t.children.map((c, j) => ({
          report_id: reportId,
          parent_task_id: parentTask.id,
          title: String(c.title || '').trim() || '(無題)',
          description: c.description ?? null,
          estimated_hours: c.estimated_hours != null ? Number(c.estimated_hours) : null,
          progress_rate: c.progress_rate != null ? Math.min(100, Math.max(0, Number(c.progress_rate))) : 0,
          priority: ['high', 'medium', 'low'].includes(c.priority ?? '') ? c.priority : 'medium',
          order_index: j,
          task_status: c.task_status ?? '未着手',
          memo: c.memo ?? null,
        }))
      )
      if (childErr) return childErr.message
    }
  }
  return null
}
