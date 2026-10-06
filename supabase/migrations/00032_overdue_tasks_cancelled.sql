-- 期日遅れ一覧から「取りやめ」にしたタスクを外す。
--
-- これまで一覧から消す手段は「進捗100%」か「ステータス=完了」しかなく、
-- 実際には終わっていないタスクを完了扱いにするか、延々と残し続けるかの二択だった。
-- もう追わないと決めたタスクに「取りやめ」を付けられるようにして、完了と区別する。
--
-- 変更点は judged の WHERE に '取りやめ' を足しただけで、他は 00031 と同じ。
-- 戻し方: 00031_overdue_tasks_function.sql をもう一度流す。

CREATE OR REPLACE FUNCTION public.overdue_tasks(
  p_today      DATE,
  p_user_id    UUID DEFAULT NULL,
  p_org_id     UUID DEFAULT NULL,
  p_stale_days INT  DEFAULT 7
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
      AND COALESCE(l.task_status, '') NOT IN ('完了', '取りやめ')
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
