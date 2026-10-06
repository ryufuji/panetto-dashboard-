-- 期日遅れタスクの判定を DB 側で行う。
--
-- クライアント側で「期日超過の行」を取ってから同名タスクの最新行だけに絞る方式は、
-- 期日超過の行が組織全体で約2,000件あり、PostgREST が1リクエストで返せる1000行を
-- 超えるため、直近の期日超過を取りこぼしていた。先に「同じ人・同じタスク名の最新行」
-- へ絞ってから判定すれば、返る行は百件程度に収まる。
--
-- 併せて「進捗が止まっているタスク」も返す。期日は先でも（あるいは期日が無くても）
-- 一定日数、進捗率がまったく動いていないものを本人の画面で気づけるようにする。
-- 毎日引き継ぐ定期タスク (is_recurring) は、進捗が動かないのが普通なので対象外。
--
-- 呼び出し元の RLS をそのまま効かせるため SECURITY INVOKER（既定）のままにする。
-- 戻し方: DROP FUNCTION IF EXISTS public.overdue_tasks(DATE, UUID, UUID, INT);

CREATE OR REPLACE FUNCTION public.overdue_tasks(
  p_today      DATE,
  p_user_id    UUID DEFAULT NULL,  -- 指定するとその人の日報だけ
  p_org_id     UUID DEFAULT NULL,  -- 指定すると組織全体
  p_stale_days INT  DEFAULT 7      -- 何日進捗が動かなければ「止まっている」とみなすか
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  due_date      DATE,
  progress_rate INT,
  task_status   TEXT,
  report_id     UUID,
  report_date   DATE,
  user_id       UUID,
  user_name     TEXT,
  is_overdue    BOOLEAN,
  is_stale      BOOLEAN,
  stale_days    INT
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      t.id,
      btrim(t.title)            AS title,
      t.due_date,
      t.progress_rate,
      t.task_status,
      t.report_id,
      COALESCE(t.is_recurring, false) AS is_recurring,
      r.report_date,
      r.user_id,
      u.name                    AS user_name
    FROM public.report_tasks t
    JOIN public.reports r ON r.id = t.report_id
    JOIN public.users   u ON u.id = r.user_id
    WHERE t.parent_task_id IS NULL
      AND btrim(COALESCE(t.title, '')) <> ''
      AND r.status IN ('submitted', 'approved')
      AND (p_user_id IS NULL OR r.user_id = p_user_id)
      AND (p_org_id  IS NULL OR r.organization_id = p_org_id)
  ),
  latest AS (
    SELECT *
    FROM (
      SELECT b.*,
             ROW_NUMBER() OVER (
               PARTITION BY b.user_id, b.title
               ORDER BY b.report_date DESC, b.id DESC
             ) AS rn
      FROM base b
    ) ranked
    WHERE rn = 1
  ),
  judged AS (
    SELECT
      l.id, l.title, l.due_date, l.progress_rate, l.task_status,
      l.report_id, l.report_date, l.user_id, l.user_name, l.is_recurring,
      (l.due_date IS NOT NULL AND l.due_date < p_today) AS is_overdue,
      older.report_date AS unchanged_since
    FROM latest l
    -- 同じ進捗率のまま p_stale_days 日以上前から残っているか
    LEFT JOIN LATERAL (
      SELECT b.report_date
      FROM base b
      WHERE b.user_id = l.user_id
        AND b.title   = l.title
        AND b.report_date <= p_today - p_stale_days
        AND b.progress_rate = l.progress_rate
      ORDER BY b.report_date DESC, b.id DESC
      LIMIT 1
    ) older ON true
    WHERE COALESCE(l.progress_rate, 0) < 100
      AND COALESCE(l.task_status, '') <> '完了'
  )
  SELECT
    id, title, due_date, progress_rate, task_status,
    report_id, report_date, user_id, user_name,
    is_overdue,
    (NOT is_recurring AND unchanged_since IS NOT NULL) AS is_stale,
    CASE WHEN NOT is_recurring AND unchanged_since IS NOT NULL
         THEN (p_today - unchanged_since)::INT END AS stale_days
  FROM judged
  WHERE is_overdue OR (NOT is_recurring AND unchanged_since IS NOT NULL)
  ORDER BY is_overdue DESC, due_date NULLS LAST, report_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.overdue_tasks(DATE, UUID, UUID, INT) TO authenticated;

-- 同名タスクの最新行を引く部分が効くように
CREATE INDEX IF NOT EXISTS idx_report_tasks_parent_title
  ON public.report_tasks (report_id, parent_task_id, title);
