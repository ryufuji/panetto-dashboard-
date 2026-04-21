/**
 * 一時テスト用: LINE Works Bot API への疎通確認。
 * POST /api/test/lineworks にトリガーすると、トークルームに動作確認メッセージを送る。
 * CRON_SECRET が設定されていれば Bearer で保護、無ければフリーアクセス（ステージング用途）。
 * 動作確認が済んだらこのファイルは削除してOK。
 */

import { NextResponse } from 'next/server'
import { sendLineWorksMessage } from '@/lib/lineworks'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const message =
    '✅ LINE Works Bot API 疎通確認\n' +
    '業務日報ダッシュボードから送信しています。\n' +
    `時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`

  const result = await sendLineWorksMessage(message)
  return NextResponse.json(result)
}

export async function GET(req: Request) {
  return POST(req)
}
