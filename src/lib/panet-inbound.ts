/**
 * panet (社内ポータル) への双方向同期 webhook 発行ユーティリティ
 *
 * 業務日報側でユーザー情報が更新された際、双方向許可カラム (department, position) を
 * panet に反映するため inbound webhook を送信する。
 *
 * 環境変数:
 *   PANET_INBOUND_URL    : 例 https://panet-53v.pages.dev/api/webhooks/inbound/users
 *   PANET_WEBHOOK_SECRET : 認証用シークレット (3サービス共通)
 */

export interface InboundFields {
  department?: string | null;
  position?: string | null;
}

/**
 * 失敗しても呼び出し元の処理は止めない（fire-and-forget だが await 可能）
 */
export async function notifyPanetInbound(
  panet_user_id: number | null | undefined,
  fields: InboundFields
): Promise<{ ok: boolean; error?: string }> {
  if (!panet_user_id) return { ok: false, error: 'no_panet_user_id' };

  // 双方向許可カラム以外は除外
  const allowed: InboundFields = {};
  if (fields.department !== undefined) allowed.department = fields.department || null;
  if (fields.position !== undefined) allowed.position = fields.position || null;
  if (Object.keys(allowed).length === 0) return { ok: false, error: 'no_fields' };

  const url = process.env.PANET_INBOUND_URL;
  const secret = process.env.PANET_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.warn('[PANET_INBOUND] PANET_INBOUND_URL or PANET_WEBHOOK_SECRET not configured');
    return { ok: false, error: 'not_configured' };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        event: 'user.updated',
        source: 'dashboard',
        timestamp: new Date().toISOString(),
        panet_user_id,
        fields: allowed,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[PANET_INBOUND] ${res.status}: ${body.slice(0, 200)}`);
      return { ok: false, error: `http_${res.status}` };
    }
    console.log(`[PANET_INBOUND] sent panet_user_id=${panet_user_id} fields=${JSON.stringify(allowed)}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PANET_INBOUND] error: ${msg}`);
    return { ok: false, error: msg };
  }
}
