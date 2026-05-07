-- panet (社内ポータル) 連携用カラム
-- panet 側で社員登録 → webhook で本ダッシュボードに自動アカウント作成
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employment_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS panet_user_id INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dashboard_password_changed BOOLEAN NOT NULL DEFAULT false;

-- 一意性: login_id は組織内で一意。panet_user_id も一意。
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_id ON public.users (login_id) WHERE login_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_panet_user_id ON public.users (panet_user_id) WHERE panet_user_id IS NOT NULL;
