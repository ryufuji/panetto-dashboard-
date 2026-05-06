/**
 * LINE Works Bot API 送信ライブラリ (API 2.0)
 *
 * 流れ:
 *   1. Service Account の秘密鍵で JWT (RS256) を署名
 *   2. JWT を Assertion として OAuth 2.0 トークンエンドポイントに投げ access_token を取得
 *   3. Bot API (https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages)
 *      に Bearer トークン付きで POST
 *
 * access_token はデフォルト 24h 有効なので、プロセスメモリにキャッシュして再利用する。
 * 失敗時は throw せず console.error のみ。
 *
 * 必要な環境変数:
 *   LINEWORKS_CLIENT_ID
 *   LINEWORKS_CLIENT_SECRET
 *   LINEWORKS_SERVICE_ACCOUNT
 *   LINEWORKS_PRIVATE_KEY        （-----BEGIN PRIVATE KEY----- ... 形式。\n を含む場合は \\n でエスケープして設定可）
 *   LINEWORKS_BOT_ID
 *   LINEWORKS_CHANNEL_ID
 *
 * 旧 Webhook 方式 (LINEWORKS_WEBHOOK_URL) も残しており、全環境変数が揃っていない場合の
 * フォールバックとして利用される。
 */

import crypto from 'node:crypto'

type SendOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flexContent?: any
}

type SendResult = {
  ok: boolean
  status?: number
  error?: string
}

const DEFAULT_TIMEOUT_MS = 5000
const OAUTH_TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token'
const BOT_API_BASE = 'https://www.worksapis.com/v1.0'

// アクセストークンのメモリキャッシュ（プロセス単位。Vercel サーバーレスでも各インスタンス内で有効）
let cachedToken: { accessToken: string; expiresAt: number } | null = null

/**
 * 改行を復元する。Vercel などでは秘密鍵を "\n" エスケープで保存することが多いため。
 */
function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * JWT (RS256) を生成。LINE Works OAuth 2.0 の Assertion 用。
 */
function signJwt(params: { clientId: string; serviceAccount: string; privateKey: string }): string {
  const { clientId, serviceAccount, privateKey } = params
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'RS256' }
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 60 * 60, // 1h（アクセストークン自体はこれより長く有効）
  }

  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(privateKey)

  return `${signingInput}.${base64url(signature)}`
}

/**
 * access_token を取得（キャッシュがあれば再利用）。
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.LINEWORKS_CLIENT_ID
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT
  const rawPrivateKey = process.env.LINEWORKS_PRIVATE_KEY

  if (!clientId || !clientSecret || !serviceAccount || !rawPrivateKey) {
    return null
  }

  // キャッシュ有効（期限の60秒前までを有効とみなす）
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken
  }

  try {
    const privateKey = normalizePrivateKey(rawPrivateKey)
    const assertion = signJwt({ clientId, serviceAccount, privateKey })

    const body = new URLSearchParams({
      assertion,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'bot',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[LINEWORKS] Token request failed: status=${res.status} body=${text.slice(0, 500)}`)
      return null
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) {
      console.error('[LINEWORKS] Token response missing access_token')
      return null
    }

    const expiresInMs = (json.expires_in ?? 86400) * 1000
    cachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + expiresInMs,
    }
    return json.access_token
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[LINEWORKS] Token fetch error: ${msg}`)
    return null
  }
}

/**
 * Bot API 経由でメッセージを送信。
 */
async function sendViaBotApi(text: string, options?: SendOptions): Promise<SendResult> {
  const botId = process.env.LINEWORKS_BOT_ID
  const channelId = process.env.LINEWORKS_CHANNEL_ID
  if (!botId || !channelId) {
    return { ok: false, error: 'bot_or_channel_not_configured' }
  }

  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: 'access_token_unavailable' }
  }

  const payload = options?.flexContent
    ? { content: options.flexContent }
    : { content: { type: 'text', text } }

  const url = `${BOT_API_BASE}/bots/${botId}/channels/${channelId}/messages`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[LINEWORKS] Bot API send failed: status=${res.status} body=${body.slice(0, 500)}`)
      // 401 の場合はトークンが失効している可能性があるためキャッシュをクリア
      if (res.status === 401) cachedToken = null
      return { ok: false, status: res.status, error: body }
    }

    console.log(`[LINEWORKS] Bot API sent successfully: status=${res.status}`)
    return { ok: true, status: res.status }
  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[LINEWORKS] Bot API send error: ${msg}`)
    return { ok: false, error: msg }
  }
}

/**
 * 旧 Webhook URL 方式（Zapier 等の中継を使う場合のフォールバック）。
 */
async function sendViaWebhook(text: string, options?: SendOptions): Promise<SendResult> {
  const webhookUrl = process.env.LINEWORKS_WEBHOOK_URL
  if (!webhookUrl) {
    return { ok: false, error: 'webhook_url_not_configured' }
  }

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
      console.error(`[LINEWORKS] Webhook send failed: status=${res.status} body=${body.slice(0, 500)}`)
      return { ok: false, status: res.status, error: body }
    }

    console.log(`[LINEWORKS] Webhook sent successfully: status=${res.status}`)
    return { ok: true, status: res.status }
  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[LINEWORKS] Webhook send error: ${msg}`)
    return { ok: false, error: msg }
  }
}

/**
 * LINE Works にメッセージを送信する。
 * Bot API 用の環境変数が揃っていれば Bot API、無ければ Webhook URL にフォールバック。
 * どちらも無ければ警告ログを出してスキップ。失敗しても throw しない。
 */
export async function sendLineWorksMessage(
  text: string,
  options?: SendOptions
): Promise<SendResult> {
  const hasBotCreds =
    !!process.env.LINEWORKS_CLIENT_ID &&
    !!process.env.LINEWORKS_CLIENT_SECRET &&
    !!process.env.LINEWORKS_SERVICE_ACCOUNT &&
    !!process.env.LINEWORKS_PRIVATE_KEY &&
    !!process.env.LINEWORKS_BOT_ID &&
    !!process.env.LINEWORKS_CHANNEL_ID

  if (hasBotCreds) {
    return sendViaBotApi(text, options)
  }

  if (process.env.LINEWORKS_WEBHOOK_URL) {
    return sendViaWebhook(text, options)
  }

  console.warn('[LINEWORKS] No credentials configured. Skipping message send.')
  return { ok: false, error: 'not_configured' }
}

export type LineWorksTaskInfo = {
  title: string
  status?: string | null
  description?: string | null
  progress_rate?: number | null
  priority?: string | null
  estimated_hours?: number | null
  actual_hours?: number | null
  due_date?: string | null
}

/**
 * 日報提出通知メッセージを整形する。
 * タスクごとに「タイトル / 進捗 / 期限 / 詳細(description)」を含めた
 * 詳しい内容を送る。本文は2000文字でハードカット。
 */
export function formatReportSubmittedMessage(params: {
  reportId: string
  userName: string
  reportDate: string // YYYY-MM-DD
  departmentName?: string | null
  workHours?: number | null
  progressRate?: number | null
  title?: string | null
  tasks: LineWorksTaskInfo[]
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

  const dateLabel = reportDate.replace(/-/g, '/')
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
  const priorityLabel = (p?: string | null) =>
    p === 'high' ? '高' : p === 'low' ? '低' : p === 'medium' ? '中' : null

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

  const totalTasks = tasks.length
  const shownTasks = tasks.slice(0, 5)
  lines.push(`✅ タスク (${totalTasks}件):`)
  for (const t of shownTasks) {
    // 1行目: タイトル + ステータス + 進捗 + 優先度
    const meta: string[] = []
    if (t.status) meta.push(t.status)
    if (t.progress_rate !== null && t.progress_rate !== undefined) meta.push(`${t.progress_rate}%`)
    const pl = priorityLabel(t.priority)
    if (pl && pl !== '中') meta.push(`優先度:${pl}`)
    const metaStr = meta.length > 0 ? ` [${meta.join(' / ')}]` : ''
    lines.push(`  ・${t.title}${metaStr}`)

    // 2行目: 期限と工数
    const sub: string[] = []
    if (t.due_date) sub.push(`期限: ${t.due_date}`)
    if (t.estimated_hours) sub.push(`見積${t.estimated_hours}h`)
    if (t.actual_hours) sub.push(`実績${t.actual_hours}h`)
    if (sub.length > 0) lines.push(`     ${sub.join(' / ')}`)

    // 3行目: 詳細(description) があれば 100 文字まで
    if (t.description && t.description.trim()) {
      lines.push(`     ${truncate(t.description.trim().replace(/\n/g, ' '), 100)}`)
    }
  }
  if (totalTasks > shownTasks.length) {
    lines.push(`  ...他${totalTasks - shownTasks.length}件`)
  }
  lines.push('')

  if (nextDayPlan) {
    const trim = nextDayPlan.length > 200 ? nextDayPlan.slice(0, 200) + '…' : nextDayPlan
    lines.push('🗓 明日の予定:')
    lines.push(trim)
    lines.push('')
  }

  if (appUrl) {
    lines.push(`🔗 詳細: ${appUrl}/reports/${reportId}`)
  }

  const body = lines.join('\n')
  if (body.length > 2000) {
    return body.slice(0, 1997) + '...'
  }
  return body
}
