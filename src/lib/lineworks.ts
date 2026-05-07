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
  task_status?: string | null      // 未着手 / 進行中 / 完了 / 保留
  progress_rate?: number | null
  estimated_hours?: number | null
  due_date?: string | null
  memo?: string | null             // 備考・メモ (なければ description でフォールバック)
  description?: string | null
  actual_url?: string | null       // 進行中・実績URL (証跡)
  children?: { title: string }[]   // 子課題タイトルのみ
}

export type LineWorksPlannedTask = {
  title: string
}

/**
 * 日報提出通知メッセージを整形する (v2: 平氏のフォーマット)
 *
 * 例:
 *   【日報】2026-05-06 平 雅行
 *
 *   報告日：2026-05-06 19:47
 *   勤務時間：10:00-19:47
 *   氏名：平 雅行
 *   所属：東京/制作
 *   業務内容：
 *
 *   ●【水戸ハピドリ】指名料チケット2000円(進捗70％/進行中/工数1.5h)
 *   メモ：修正後確認中
 *   期日：2026-05-08
 *   証跡：https://panet.backlog.jp/view/MHD_PJ-2356
 *
 *   ========
 *   明日のタスク
 *   ・キャストさん名刺作成
 *   ・タスク整理
 *
 * 本文は2000文字でハードカット。
 */
export function formatReportSubmittedMessage(params: {
  reportId: string
  userName: string
  reportDate: string // YYYY-MM-DD
  submittedAt?: string | null   // ISO 文字列。なければ現在時刻
  startTime?: string | null     // HH:MM
  endTime?: string | null       // HH:MM
  officeName?: string | null
  departmentName?: string | null
  tasks: LineWorksTaskInfo[]
  plannedTasks?: LineWorksPlannedTask[]
  nextDayPlanText?: string | null  // 明日のタスクのフリーテキスト（plannedTasks が無いときのフォールバック）
}): string {
  const {
    userName,
    reportDate,
    submittedAt,
    startTime,
    endTime,
    officeName,
    departmentName,
    tasks,
    plannedTasks,
    nextDayPlanText,
  } = params

  // 「報告日：YYYY-MM-DD HH:MM」用に submitted_at を JST で整形
  const submittedLabel = (() => {
    const d = submittedAt ? new Date(submittedAt) : new Date()
    if (isNaN(d.getTime())) return reportDate
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    const yyyy = jst.getUTCFullYear()
    const mm = String(jst.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(jst.getUTCDate()).padStart(2, '0')
    const hh = String(jst.getUTCHours()).padStart(2, '0')
    const mi = String(jst.getUTCMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
  })()

  // 勤務時間
  const trimSec = (t?: string | null) => (t ? t.slice(0, 5) : '')
  const workTimeLabel = (() => {
    const s = trimSec(startTime)
    const e = trimSec(endTime)
    if (s && e) return `${s}-${e}`
    if (s) return `${s}-`
    if (e) return `-${e}`
    return ''
  })()

  // 所属（東京/制作 のように）
  const affiliationParts = [officeName, departmentName].filter(Boolean) as string[]
  const affiliation = affiliationParts.join('/')

  const lines: string[] = []
  lines.push(`【日報】${reportDate} ${userName}`)
  lines.push('')
  lines.push(`報告日：${submittedLabel}`)
  if (workTimeLabel) lines.push(`勤務時間：${workTimeLabel}`)
  lines.push(`氏名：${userName}`)
  if (affiliation) lines.push(`所属：${affiliation}`)
  lines.push('業務内容：')
  lines.push('')

  // 親タスクの繰り返し
  const statusLabel = (t: LineWorksTaskInfo) => {
    if (t.task_status) return t.task_status
    const pr = t.progress_rate ?? 0
    if (pr >= 100) return '完了'
    if (pr > 0) return '進行中'
    return '未着手'
  }

  for (const t of tasks) {
    const meta: string[] = []
    if (t.progress_rate !== null && t.progress_rate !== undefined) {
      meta.push(`進捗${t.progress_rate}％`)
    }
    meta.push(statusLabel(t))
    if (t.estimated_hours !== null && t.estimated_hours !== undefined) {
      meta.push(`工数${t.estimated_hours}h`)
    }
    const metaStr = meta.length > 0 ? `(${meta.join('/')})` : ''
    lines.push(`●${t.title}${metaStr}`)

    const memo = (t.memo && t.memo.trim()) || (t.description && t.description.trim()) || ''
    if (memo) lines.push(`メモ：${memo.replace(/\n/g, ' ')}`)
    if (t.due_date) lines.push(`期日：${t.due_date}`)
    if (t.actual_url && t.actual_url.trim()) lines.push(`証跡：${t.actual_url.trim()}`)

    // 子課題は小さなドット
    for (const c of t.children || []) {
      if (c.title && c.title.trim()) lines.push(`・${c.title.trim()}`)
    }

    lines.push('')
  }

  // 明日のタスク
  lines.push('========')
  lines.push('明日のタスク')
  if (plannedTasks && plannedTasks.length > 0) {
    for (const p of plannedTasks) {
      if (p.title && p.title.trim()) lines.push(`・${p.title.trim()}`)
    }
  } else if (nextDayPlanText && nextDayPlanText.trim()) {
    // フリーテキストを行ごとに分解。「・」が無ければ自動付与
    const items = nextDayPlanText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    for (const item of items) {
      if (item.startsWith('・') || item.startsWith('-') || item.startsWith('*')) {
        lines.push(item)
      } else {
        lines.push(`・${item}`)
      }
    }
  }

  const body = lines.join('\n')
  if (body.length > 2000) {
    return body.slice(0, 1997) + '...'
  }
  return body
}
