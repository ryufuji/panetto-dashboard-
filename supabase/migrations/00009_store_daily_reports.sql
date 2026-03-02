-- Store daily reports: aggregated daily reports from external task manager (タス軽くん)
CREATE TABLE public.store_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  external_user_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  report_date DATE NOT NULL,
  task_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, external_user_id, report_date)
);

CREATE TABLE public.store_daily_report_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.store_daily_reports(id) ON DELETE CASCADE,
  external_task_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  start_date DATE,
  due_date DATE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auto-update updated_at
CREATE TRIGGER trg_store_daily_reports_updated_at
  BEFORE UPDATE ON public.store_daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- indexes
CREATE INDEX idx_store_daily_reports_org_date ON public.store_daily_reports(organization_id, report_date DESC);
CREATE INDEX idx_store_daily_report_tasks_report ON public.store_daily_report_tasks(report_id);
