/**
 * LINE Works 投稿ライブラリ
 *
 * 現状は Incoming Webhook 方式のみサポート。
 * 将来 Bot API 方式（JWT + OAuth）に差し替える場合は、このファイル内で
 * sendLineWorksMessage の実装を切り替えるだけで済むよう抽象化している。
 *
 * 失敗時は throw せず console.error に残すのみ（呼び出し側の処理を止めない）。
 */

type SendOptions = {
  // 将来的に Flex Message 等のリッチコンテンツを送る拡張口
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flexContent?: any
}

type SendResult = {
  ok: boolean
  status?: number
  error?: string
}

const DEFAULT_TIMEOUT_MS = 5000

/**
 * LINE Works トークルームにメッセージを送信する。
 *
 * @param text プレーンテキスト本文
 * @param options 将来拡張用（Flex 等）
 * @returns 送信結果。失敗しても throw しない。
 */
export async function sendLineWorksMessage(
  text: string,
  options?: SendOptions
): Promise<SendResult> {
  const webhookUrl = process.env.LINEWORKS_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[LINEWORKS] LINEWORKS_WEBHOOK_URL is not set. Skipping message send.')
    return { ok: false, error: 'webhook_url_not_configured' }
  }

  // LINE Works Incoming Webhook 形式
  const payload = options?.flexContent
    ? { content: options.flexContent }
    : { content: { type: 'text', text } }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `[LINEWORKS] Send failed: status=${res.status} body=${body.slice(0, 500)}`
      )
      return { ok: false, status: res.status, error: body }
    }

    console.log(`[LINEWORKS] Sent successfully: status=${res.status}`)
    return { ok: true, status: res.status }
  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[LINEWORKS] Send error: ${msg}`)
    return { ok: false, error: msg }
  }
}

/**
 * 日報提出通知メッセージを整形する。
 * 本文2000文字の上限を意識し、next_day_plan は200字で切り詰め、
 * タスク一覧は5件まで表示する。
 */
export function formatReportSubmittedMessage(params: {
  reportId: string
  userName: string
  reportDate: string // YYYY-MM-DD
  departmentName?: string | null
  workHours?: number | null
  progressRate?: number | null
  title?: string | null
  tasks: { title: string; status?: string | null }[]
  nextDayPlan?: string | null
  appUrl?: string
}): string {
  const {
    reportId,
    userName,
    reportDate,
    departmentName,
    workHours,
    progressRate,
    title,
    tasks,
    nextDayPlan,
    appUrl,
  } = params

  // YYYY-MM-DD → YYYY/MM/DD
  const dateLabel = reportDate.replace(/-/g, '/')

  const lines: string[] = []
  lines.push('📋 業務日報が提出されました')
  lines.push('────────────────')
  lines.push(`👤 提出者: ${userName}`)
  lines.push(`📅 対象日: ${dateLabel}`)
  if (departmentName) lines.push(`🏢 部署: ${departmentName}`)
  if (workHours !== null && workHours !== undefined) {
    lines.push(`⏱ 稼働時間: ${workHours}h`)
  }
  if (progressRate !== null && progressRate !== undefined) {
    lines.push(`📊 進捗率: ${progressRate}%`)
  }
  lines.push('')

  if (title) {
    lines.push(`📝 タイトル: ${title}`)
    lines.push('')
  }

  // タスク一覧（最大5件）
  const totalTasks = tasks.length
  const shownTasks = tasks.slice(0, 5)
  lines.push(`✅ 今日のタスク (${totalTasks}件):`)
  for (const t of shownTasks) {
    const statusLabel = t.status ? ` [${t.status}]` : ''
    lines.push(`  ・${t.title}${statusLabel}`)
  }
  if (totalTasks > shownTasks.length) {
    lines.push(`  ...他${totalTasks - shownTasks.length}件`)
  }
  lines.push('')

  // 明日の予定（200文字まで）
  if (nextDayPlan) {
    const truncated = nextDayPlan.length > 200
      ? nextDayPlan.slice(0, 200) + '…'
      : nextDayPlan
    lines.push('🗓 明日の予定:')
    lines.push(truncated)
    lines.push('')
  }

  if (appUrl) {
    lines.push(`🔗 詳細: ${appUrl}/reports/${reportId}`)
  }

  const body = lines.join('\n')

  // 念のため2000文字でハードカット
  if (body.length > 2000) {
    return body.slice(0, 1997) + '...'
  }
  return body
}
