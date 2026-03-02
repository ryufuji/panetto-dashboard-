-- 備品購入カテゴリ用の追加フィールド
ALTER TABLE public.approval_requests ADD COLUMN equipment_purpose TEXT;
ALTER TABLE public.approval_requests ADD COLUMN equipment_user TEXT;
