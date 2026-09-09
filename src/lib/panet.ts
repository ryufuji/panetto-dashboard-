interface PanetCreateUserPayload {
  email: string
  display_name: string
  department?: string
  password?: string
  birth_date?: string
  role?: 'admin' | 'employee'
  join_year?: number
}

interface PanetCreateUserResult {
  user: { id: number; email: string; display_name: string }
  created: boolean
  message?: string
}

interface PanetBulkResult {
  results: Array<{ email: string; success: boolean; error?: string; panet_user_id?: number }>
  succeeded: number
  failed: number
}

const PANET_DEFAULT_PASSWORD = 'panet2026'

export async function createPanetUser(payload: PanetCreateUserPayload): Promise<PanetCreateUserResult | null> {
  const apiUrl = process.env.PANET_API_URL
  const apiKey = process.env.PANET_API_KEY

  if (!apiUrl || !apiKey) {
    console.warn('[PANET] API URL or key not configured, skipping account creation')
    return null
  }

  try {
    const res = await fetch(`${apiUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        ...payload,
        password: payload.password || PANET_DEFAULT_PASSWORD,
      }),
    })

    const data = await res.json()

    if (!res.ok && res.status !== 409) {
      console.error('[PANET] User creation failed:', data.error || res.statusText)
      return null
    }

    return data as PanetCreateUserResult
  } catch (err) {
    console.error('[PANET] Network error:', err)
    return null
  }
}

export async function createPanetUsersBulk(
  users: PanetCreateUserPayload[]
): Promise<PanetBulkResult | null> {
  const apiUrl = process.env.PANET_API_URL
  const apiKey = process.env.PANET_API_KEY

  if (!apiUrl || !apiKey) {
    console.warn('[PANET] API URL or key not configured, skipping bulk creation')
    return null
  }

  try {
    const res = await fetch(`${apiUrl}/api/admin/users/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        users: users.map((u) => ({
          ...u,
          password: u.password || PANET_DEFAULT_PASSWORD,
        })),
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[PANET] Bulk creation failed:', data.error || res.statusText)
      return null
    }

    return await res.json()
  } catch (err) {
    console.error('[PANET] Network error:', err)
    return null
  }
}

export interface PanetUserRecord {
  id: number
  email: string
  display_name: string
  department: string | null
  position: string | null
  area: string | null
  affiliation: string | null
  role: string
  archived: number | boolean
  join_date: string | null
}

/**
 * PANET の全ユーザー一覧を取得する（GET /api/admin/users）。
 * 部署の一括取込で使う。未設定・失敗時は null（呼び出し側でエラー表示）。
 */
export async function fetchPanetUsers(): Promise<{ users: PanetUserRecord[] } | { error: string }> {
  const apiUrl = process.env.PANET_API_URL
  const apiKey = process.env.PANET_API_KEY
  if (!apiUrl || !apiKey) return { error: 'PANET_API_URL / PANET_API_KEY が設定されていません' }
  try {
    const res = await fetch(`${apiUrl}/api/admin/users`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (res.status === 404) return { error: 'PANET 側にユーザー一覧 API（GET /api/admin/users）がありません。PANET を最新版にデプロイしてください' }
    if (!res.ok) return { error: `PANET から一覧を取得できませんでした（HTTP ${res.status}）` }
    const data = await res.json()
    return { users: (data.users || []) as PanetUserRecord[] }
  } catch (err) {
    return { error: `PANET への接続に失敗しました: ${err instanceof Error ? err.message : String(err)}` }
  }
}
