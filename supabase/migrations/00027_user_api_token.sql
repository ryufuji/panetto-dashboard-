-- 外部自動化（GAS / Claude Code）からの下書き投入用 API トークン
-- users テーブルに api_token (UUID) を追加
-- GET /api/external/draft, POST /api/external/draft で Bearer 認証に使用

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS api_token UUID DEFAULT gen_random_uuid();

-- 既存ユーザーにはトークンをランダムUUIDで自動生成（NULLのまま放置しない）
UPDATE public.users SET api_token = gen_random_uuid() WHERE api_token IS NULL;

-- トークンでの高速ルックアップ用インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_token
  ON public.users (api_token) WHERE api_token IS NOT NULL;
