-- 業務日報フォーム v2 拡張
-- 参考UIに合わせて以下を追加:
--   reports: 開始/終了時刻
--   report_tasks: 目的・備考・URL・ノルマ・各種フラグ
--   report_task_shared_users: 共有ユーザー(参照のみ)

-- =====================================================
-- reports テーブル
-- =====================================================
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

-- =====================================================
-- report_tasks テーブル: 詳細フィールド
-- =====================================================
ALTER TABLE public.report_tasks
  ADD COLUMN IF NOT EXISTS purpose TEXT,                   -- 目的・背景
  ADD COLUMN IF NOT EXISTS memo TEXT,                      -- 備考・メモ
  ADD COLUMN IF NOT EXISTS actual_url TEXT,                -- 進行中・実績URL
  ADD COLUMN IF NOT EXISTS target_norma_count INTEGER,     -- ノルマ目標 (件数)
  ADD COLUMN IF NOT EXISTS target_norma_amount NUMERIC,    -- ノルマ目標 (金額)
  ADD COLUMN IF NOT EXISTS today_result_count INTEGER,     -- 今日の成果 (件数)
  ADD COLUMN IF NOT EXISTS today_result_amount NUMERIC,    -- 今日の成果 (金額)
  ADD COLUMN IF NOT EXISTS no_norma BOOLEAN NOT NULL DEFAULT false,    -- ノルマなしフラグ
  ADD COLUMN IF NOT EXISTS no_due_date BOOLEAN NOT NULL DEFAULT false, -- 期日なしフラグ
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,-- 定期タスクフラグ
  ADD COLUMN IF NOT EXISTS is_omitted BOOLEAN NOT NULL DEFAULT false,  -- 省略フラグ
  ADD COLUMN IF NOT EXISTS task_status TEXT;               -- ステータス(別途。例: 進行中/完了/着手前)

-- =====================================================
-- report_task_shared_users: 共有ユーザー(参照のみ)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.report_task_shared_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.report_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rtsu_task_id ON public.report_task_shared_users(task_id);
CREATE INDEX IF NOT EXISTS idx_rtsu_user_id ON public.report_task_shared_users(user_id);

-- RLS: 組織内なら参照可、本人/admin/共有先のみ追加・削除可
ALTER TABLE public.report_task_shared_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rtsu_select_org_members" ON public.report_task_shared_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.report_tasks rt
      JOIN public.reports r ON r.id = rt.report_id
      JOIN public.users u ON u.id = auth.uid()
      WHERE rt.id = task_id AND r.organization_id = u.organization_id
    )
  );

CREATE POLICY "rtsu_modify_owner_or_admin" ON public.report_task_shared_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.report_tasks rt
      JOIN public.reports r ON r.id = rt.report_id
      JOIN public.users u ON u.id = auth.uid()
      WHERE rt.id = task_id
        AND (r.user_id = auth.uid() OR u.role = 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.report_tasks rt
      JOIN public.reports r ON r.id = rt.report_id
      JOIN public.users u ON u.id = auth.uid()
      WHERE rt.id = task_id
        AND (r.user_id = auth.uid() OR u.role = 'admin')
    )
  );
