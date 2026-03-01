-- Link approval_requests to report_tasks
ALTER TABLE public.approval_requests
  ADD COLUMN report_task_id UUID REFERENCES public.report_tasks(id) ON DELETE SET NULL;

-- 1タスクにつき最大1申請
CREATE UNIQUE INDEX idx_approval_requests_report_task
  ON public.approval_requests(report_task_id)
  WHERE report_task_id IS NOT NULL;
