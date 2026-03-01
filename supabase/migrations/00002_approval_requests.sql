-- =============================================
-- 汎用申請管理（承認ワークフロー）
-- =============================================

-- 申請テーブル
CREATE TABLE public.approval_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'other'
                    CHECK (category IN ('equipment_purchase','expense','document_review','leave','other')),
  custom_category TEXT,
  amount          NUMERIC,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending','approved','rejected','cancelled')),
  current_step    INTEGER NOT NULL DEFAULT 0,
  total_steps     INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 承認ステップテーブル
CREATE TABLE public.approval_request_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  step_number     INTEGER NOT NULL,
  approver_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  comment         TEXT,
  acted_at        TIMESTAMPTZ,
  UNIQUE(request_id, step_number)
);

-- 添付ファイルテーブル
CREATE TABLE public.approval_request_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size       BIGINT NOT NULL DEFAULT 0,
  content_type    TEXT,
  uploaded_by     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 履歴テーブル
CREATE TABLE public.approval_request_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  action          TEXT NOT NULL
                    CHECK (action IN ('created','submitted','approved','rejected','cancelled')),
  actor_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step_number     INTEGER,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 金額閾値ルールテーブル
CREATE TABLE public.approval_threshold_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_amount      NUMERIC NOT NULL DEFAULT 0,
  max_amount      NUMERIC,
  required_steps  INTEGER NOT NULL DEFAULT 1
);

-- デフォルト閾値ルール（組織作成時にINSERTする想定だが、
-- 既存組織向けに全組織分のデフォルトを一括挿入）
INSERT INTO public.approval_threshold_rules (organization_id, min_amount, max_amount, required_steps)
SELECT id, 0, 100000, 1 FROM public.organizations
UNION ALL
SELECT id, 100000, 1000000, 2 FROM public.organizations
UNION ALL
SELECT id, 1000000, NULL, 3 FROM public.organizations;

-- RLS
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_threshold_rules ENABLE ROW LEVEL SECURITY;

-- approval_requests: 同じ組織のメンバーが閲覧・操作可能
CREATE POLICY "approval_requests_select" ON public.approval_requests
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "approval_requests_insert" ON public.approval_requests
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "approval_requests_update" ON public.approval_requests
  FOR UPDATE USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "approval_requests_delete" ON public.approval_requests
  FOR DELETE USING (
    requester_id = auth.uid()
  );

-- approval_request_steps: 申請と同じ組織
CREATE POLICY "approval_request_steps_select" ON public.approval_request_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "approval_request_steps_insert" ON public.approval_request_steps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "approval_request_steps_update" ON public.approval_request_steps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );

-- approval_request_attachments: 申請と同じ組織
CREATE POLICY "approval_request_attachments_select" ON public.approval_request_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "approval_request_attachments_insert" ON public.approval_request_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "approval_request_attachments_delete" ON public.approval_request_attachments
  FOR DELETE USING (
    uploaded_by = auth.uid()
  );

-- approval_request_history: 申請と同じ組織
CREATE POLICY "approval_request_history_select" ON public.approval_request_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "approval_request_history_insert" ON public.approval_request_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
        AND ar.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  );

-- approval_threshold_rules: 同じ組織
CREATE POLICY "approval_threshold_rules_select" ON public.approval_threshold_rules
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "approval_threshold_rules_insert" ON public.approval_threshold_rules
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "approval_threshold_rules_update" ON public.approval_threshold_rules
  FOR UPDATE USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );
CREATE POLICY "approval_threshold_rules_delete" ON public.approval_threshold_rules
  FOR DELETE USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );

-- インデックス
CREATE INDEX idx_approval_requests_org ON public.approval_requests(organization_id);
CREATE INDEX idx_approval_requests_requester ON public.approval_requests(requester_id);
CREATE INDEX idx_approval_requests_status ON public.approval_requests(status);
CREATE INDEX idx_approval_request_steps_request ON public.approval_request_steps(request_id);
CREATE INDEX idx_approval_request_steps_approver ON public.approval_request_steps(approver_id);
CREATE INDEX idx_approval_request_attachments_request ON public.approval_request_attachments(request_id);
CREATE INDEX idx_approval_request_history_request ON public.approval_request_history(request_id);
CREATE INDEX idx_approval_threshold_rules_org ON public.approval_threshold_rules(organization_id);
