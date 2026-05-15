-- 定期タスクの繰り返しパターン
-- 既存の is_recurring (boolean) と組み合わせて使う:
--   is_recurring=false → 通常タスク (recurrence_pattern は無視)
--   is_recurring=true  → 定期タスク。recurrence_pattern に従い、
--                         次回日報作成時に自動でその日のタスクに取り込まれる
--                         (NULL の場合は 'daily' とみなす)

ALTER TABLE public.report_tasks
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT;
-- 取りうる値: 'daily' | 'weekly' | 'biweekly' | 'monthly'

-- 検索用: 定期タスクの抽出を高速化
CREATE INDEX IF NOT EXISTS idx_report_tasks_recurring
  ON public.report_tasks(is_recurring) WHERE is_recurring = true;
