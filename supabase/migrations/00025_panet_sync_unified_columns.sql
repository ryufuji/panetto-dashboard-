-- panet (社内ポータル) との統合スキーマに合わせるためのカラム追加
-- 本番影響ゼロ: 全カラム NULL 許容、既存カラム変更なし
-- ロールバック可能: DROP COLUMN で削除可能

-- 統一カラム追加（IF NOT EXISTSで冪等性保証）
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS panet_display_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS panet_birth_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS panet_join_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS panet_affiliation TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS panet_synced_at TIMESTAMPTZ;

-- index for sync queries
CREATE INDEX IF NOT EXISTS idx_users_panet_synced_at ON public.users (panet_synced_at)
  WHERE panet_synced_at IS NOT NULL;
