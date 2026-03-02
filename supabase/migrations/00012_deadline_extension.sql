-- =============================================
-- 期限延長申請テーブル
-- =============================================

CREATE TABLE public.deadline_extension_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_task_id    UUID REFERENCES public.report_tasks(id) ON DELETE SET NULL,
  report_id         UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  task_title        TEXT NOT NULL,
  requester_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  approver_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  original_due_date DATE NOT NULL,
  proposed_due_date DATE NOT NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  approver_comment  TEXT,
  acted_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.deadline_extension_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deadline_extension_requests_select" ON public.deadline_extension_requests
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "deadline_extension_requests_insert" ON public.deadline_extension_requests
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "deadline_extension_requests_update" ON public.deadline_extension_requests
  FOR UPDATE USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );

-- インデックス
CREATE INDEX idx_deadline_ext_req_report_task ON public.deadline_extension_requests(report_task_id);
CREATE INDEX idx_deadline_ext_req_requester ON public.deadline_extension_requests(requester_id);
CREATE INDEX idx_deadline_ext_req_approver ON public.deadline_extension_requests(approver_id);
CREATE INDEX idx_deadline_ext_req_status ON public.deadline_extension_requests(status);
CREATE INDEX idx_deadline_ext_req_report ON public.deadline_extension_requests(report_id);
