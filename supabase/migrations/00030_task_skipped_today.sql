-- 「今日は実施しない」フラグ。
-- 既存の is_omitted（画面上の「省略」）とは別の列にする。is_omitted は 2026-09-01 以降に
-- 実データで使われており（2026-10-05 時点で 103 件・日報 46 件）、意味を変えると
-- 過去の日報の表示と保存済みの進捗率が変わってしまうため、再利用しない。
--
-- 既定値ありの boolean 追加なので、既存行の書き換えは発生しない（PostgreSQL 11 以降）。
-- 戻し方: ALTER TABLE public.report_tasks DROP COLUMN IF EXISTS is_skipped_today;

ALTER TABLE public.report_tasks
  ADD COLUMN IF NOT EXISTS is_skipped_today BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.report_tasks.is_skipped_today IS
  'その日の日報には載せないが、タスクは残して翌日以降の引き継ぎ対象にする';
