-- =============================================
-- 00017: report_tasks に start_date カラムを追加
-- タスク作成日をデフォルトのスタート日とする
-- =============================================

ALTER TABLE public.report_tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;
