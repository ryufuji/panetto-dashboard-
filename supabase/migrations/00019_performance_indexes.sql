-- Performance indexes for 300-user production load
-- Focuses on hot paths: reports list, approvals queue, dashboard KPIs, tasukaru sync

-- Reports: list page sort + per-user history
CREATE INDEX IF NOT EXISTS idx_reports_report_date_desc
  ON reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_report_date
  ON reports (status, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_report_date
  ON reports (user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_department_report_date
  ON reports (department_id, report_date);

-- Store daily reports (tasukaru mirror)
CREATE INDEX IF NOT EXISTS idx_store_daily_reports_report_date_desc
  ON store_daily_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_store_daily_report_tasks_external
  ON store_daily_report_tasks (external_task_id);
CREATE INDEX IF NOT EXISTS idx_store_daily_report_tasks_report
  ON store_daily_report_tasks (report_id);

-- Approvals
CREATE INDEX IF NOT EXISTS idx_approvals_status_requested
  ON approvals (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status_created
  ON approval_requests (status, created_at DESC);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_active_department
  ON users (is_active, department_id);

-- Store tasks
CREATE INDEX IF NOT EXISTS idx_store_tasks_status_created
  ON store_tasks (status, created_at DESC);

-- Advisory lock helpers for sync jobs (tasukaru etc.)
CREATE OR REPLACE FUNCTION try_sync_lock(key text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_lock(hashtext(key));
$$;

CREATE OR REPLACE FUNCTION release_sync_lock(key text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_advisory_unlock(hashtext(key));
$$;
