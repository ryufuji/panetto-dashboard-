/**
 * LINE Works 連携の疎通確認用エンドポイント。
 * ブラウザで /api/debug/lineworks-test にアクセスすると LINE Works に
 * テストメッセージを送り、Bot API のレスポンスをそのまま返す。
 * 本番では admin ロールのみ叩けるよう制限。
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendLineWorksMessage } from '@/lib/lineworks'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden (admin only)' }, { status: 403 })
  }

  const testMessage = `[テスト] LINE Works 疎通確認 ${new Date().toISOString()}`
  const result = await sendLineWorksMessage(testMessage)

  // 環境変数の有無 (中身は出さない、有無のみ)
  const env = {
    LINEWORKS_CLIENT_ID: !!process.env.LINEWORKS_CLIENT_ID,
    LINEWORKS_CLIENT_SECRET: !!process.env.LINEWORKS_CLIENT_SECRET,
    LINEWORKS_SERVICE_ACCOUNT: !!process.env.LINEWORKS_SERVICE_ACCOUNT,
    LINEWORKS_PRIVATE_KEY: !!process.env.LINEWORKS_PRIVATE_KEY,
    LINEWORKS_BOT_ID: !!process.env.LINEWORKS_BOT_ID,
    LINEWORKS_CHANNEL_ID: !!process.env.LINEWORKS_CHANNEL_ID,
    LINEWORKS_WEBHOOK_URL: !!process.env.LINEWORKS_WEBHOOK_URL,
  }

  return NextResponse.json({
    sent_message: testMessage,
    result,
    env,
  })
}
