-- =============================================================================
-- 00001_complete_schema.sql
-- Complete database schema for パネット業務ダッシュボード (Panetto Business Dashboard)
-- Aligned with src/lib/supabase/types.ts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Helper function: auto-update updated_at column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- ===== 2-01  organizations =====
CREATE TABLE public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  logo_url    TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  settings    JSONB       DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-02  departments =====
CREATE TABLE public.departments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  code                  TEXT        NOT NULL,
  description           TEXT,
  manager_id            UUID,
  parent_department_id  UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  order_index           INT         NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-03  offices =====
CREATE TABLE public.offices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  code            TEXT        NOT NULL,
  address         TEXT,
  phone           TEXT,
  manager_id      UUID,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TRIGGER trg_offices_updated_at
  BEFORE UPDATE ON public.offices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-04  users =====
CREATE TABLE public.users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id   UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  office_id       UUID        REFERENCES public.offices(id) ON DELETE SET NULL,
  email           TEXT        NOT NULL UNIQUE,
  name            TEXT        NOT NULL,
  name_kana       TEXT,
  avatar_url      TEXT,
  phone           TEXT,
  employee_number TEXT,
  user_type       TEXT        NOT NULL DEFAULT 'employee'
                    CHECK (user_type IN ('employee','cast','admin')),
  role            TEXT        NOT NULL DEFAULT 'employee'
                    CHECK (role IN ('admin','manager','employee')),
  position        TEXT,
  hire_date       DATE,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for departments.manager_id and offices.manager_id (deferred)
ALTER TABLE public.departments ADD CONSTRAINT fk_departments_manager
  FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.offices ADD CONSTRAINT fk_offices_manager
  FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-05  user_permissions =====
CREATE TABLE public.user_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission  TEXT        NOT NULL,
  granted_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission)
);

CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-06  report_templates =====
CREATE TABLE public.report_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  template_data   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_public       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-07  reports =====
CREATE TABLE public.reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  department_id   UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  report_date     DATE        NOT NULL,
  title           TEXT,
  work_hours      NUMERIC(5,2),
  progress_rate   INT         CHECK (progress_rate >= 0 AND progress_rate <= 100),
  next_day_plan   TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at    TIMESTAMPTZ,
  template_id     UUID        REFERENCES public.report_templates(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-08  report_tasks =====
CREATE TABLE public.report_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  parent_task_id  UUID        REFERENCES public.report_tasks(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  estimated_hours NUMERIC(5,2),
  actual_hours    NUMERIC(5,2),
  progress_rate   INT         NOT NULL DEFAULT 0 CHECK (progress_rate >= 0 AND progress_rate <= 100),
  task_type       TEXT,
  priority        TEXT        NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('high','medium','low')),
  order_index     INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_report_tasks_updated_at
  BEFORE UPDATE ON public.report_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-09  report_comments =====
CREATE TABLE public.report_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  is_private  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_report_comments_updated_at
  BEFORE UPDATE ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-10  approvals =====
CREATE TABLE public.approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_id       UUID        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  assignee_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requester_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  comment         TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_approvals_updated_at
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-11  approval_history =====
CREATE TABLE public.approval_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id     UUID        NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,
  comment         TEXT,
  previous_status TEXT,
  new_status      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== 2-12  stores =====
CREATE TABLE public.stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  office_id       UUID        REFERENCES public.offices(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  store_code      TEXT        NOT NULL,
  store_group     TEXT,
  area            TEXT,
  address         TEXT,
  phone           TEXT,
  manager_id      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  opening_date    DATE,
  capacity        INT,
  opening_time    TIME,
  closing_time    TIME,
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','closed')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, store_code)
);

CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-13  casts =====
CREATE TABLE public.casts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  name_kana       TEXT,
  stage_name      TEXT,
  avatar_url      TEXT,
  phone           TEXT,
  email           TEXT,
  birth_date      DATE,
  hire_date       DATE,
  employment_type TEXT        DEFAULT 'full_time'
                    CHECK (employment_type IN ('full_time','part_time','temporary')),
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','suspended')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_casts_updated_at
  BEFORE UPDATE ON public.casts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-14  handovers =====
CREATE TABLE public.handovers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  priority        TEXT        NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low','medium','high')),
  category        TEXT,
  is_resolved     BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  handover_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_handovers_updated_at
  BEFORE UPDATE ON public.handovers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-15  store_sales =====
CREATE TABLE public.store_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sales_date      DATE        NOT NULL,
  sales_type      TEXT        DEFAULT 'other'
                    CHECK (sales_type IN ('drink','food','bottle','other')),
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity        INT           NOT NULL DEFAULT 1,
  payment_method  TEXT        DEFAULT 'cash'
                    CHECK (payment_method IN ('cash','card','electronic')),
  registered_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_store_sales_updated_at
  BEFORE UPDATE ON public.store_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-16  shifts =====
CREATE TABLE public.shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  cast_id         UUID        NOT NULL REFERENCES public.casts(id) ON DELETE CASCADE,
  shift_date      DATE        NOT NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  break_minutes   INT         NOT NULL DEFAULT 0,
  shift_type      TEXT        NOT NULL DEFAULT 'regular'
                    CHECK (shift_type IN ('regular','overtime','holiday')),
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','confirmed','completed','absent')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-17  board_posts =====
CREATE TABLE public.board_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  content         TEXT        NOT NULL,
  category        TEXT        DEFAULT 'general',
  target_scope    TEXT        NOT NULL DEFAULT 'all'
                    CHECK (target_scope IN ('all','department','office','store')),
  target_id       UUID,
  is_pinned       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_important    BOOLEAN     NOT NULL DEFAULT FALSE,
  view_count      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_board_posts_updated_at
  BEFORE UPDATE ON public.board_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-18  todos =====
CREATE TABLE public.todos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  due_date        DATE,
  priority        TEXT        NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('high','medium','low')),
  is_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  order_index     INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-19  files =====
CREATE TABLE public.files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name         TEXT        NOT NULL,
  file_path         TEXT        NOT NULL,
  file_size         BIGINT      NOT NULL DEFAULT 0,
  file_type         TEXT,
  category          TEXT,
  folder_path       TEXT,
  access_scope      TEXT        NOT NULL DEFAULT 'all'
                      CHECK (access_scope IN ('all','department','office','private')),
  access_target_id  UUID,
  description       TEXT,
  tags              TEXT[],
  download_count    INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 2-20  audit_logs =====
CREATE TABLE public.audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  resource        TEXT        NOT NULL,
  resource_id     UUID,
  changes         JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_organizations_slug ON public.organizations(slug);

CREATE INDEX idx_departments_org ON public.departments(organization_id);
CREATE INDEX idx_departments_active ON public.departments(is_active);

CREATE INDEX idx_offices_org ON public.offices(organization_id);
CREATE INDEX idx_offices_active ON public.offices(is_active);

CREATE INDEX idx_users_org ON public.users(organization_id);
CREATE INDEX idx_users_department ON public.users(department_id);
CREATE INDEX idx_users_office ON public.users(office_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_active ON public.users(is_active);

CREATE INDEX idx_user_permissions_user ON public.user_permissions(user_id);

CREATE INDEX idx_report_templates_org ON public.report_templates(organization_id);

CREATE INDEX idx_reports_org ON public.reports(organization_id);
CREATE INDEX idx_reports_user ON public.reports(user_id);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_date ON public.reports(report_date);
CREATE INDEX idx_reports_org_date ON public.reports(organization_id, report_date DESC);
CREATE INDEX idx_reports_department ON public.reports(department_id);

CREATE INDEX idx_report_tasks_report ON public.report_tasks(report_id);
CREATE INDEX idx_report_tasks_parent ON public.report_tasks(parent_task_id);

CREATE INDEX idx_report_comments_report ON public.report_comments(report_id);

CREATE INDEX idx_approvals_report ON public.approvals(report_id);
CREATE INDEX idx_approvals_assignee ON public.approvals(assignee_id);
CREATE INDEX idx_approvals_requester ON public.approvals(requester_id);
CREATE INDEX idx_approvals_status ON public.approvals(status);

CREATE INDEX idx_approval_history_approval ON public.approval_history(approval_id);

CREATE INDEX idx_stores_org ON public.stores(organization_id);
CREATE INDEX idx_stores_office ON public.stores(office_id);
CREATE INDEX idx_stores_status ON public.stores(status);

CREATE INDEX idx_casts_store ON public.casts(store_id);
CREATE INDEX idx_casts_status ON public.casts(status);

CREATE INDEX idx_handovers_store ON public.handovers(store_id);
CREATE INDEX idx_handovers_resolved ON public.handovers(is_resolved);

CREATE INDEX idx_store_sales_store ON public.store_sales(store_id);
CREATE INDEX idx_store_sales_date ON public.store_sales(sales_date);
CREATE INDEX idx_store_sales_store_date ON public.store_sales(store_id, sales_date DESC);

CREATE INDEX idx_shifts_store ON public.shifts(store_id);
CREATE INDEX idx_shifts_cast ON public.shifts(cast_id);
CREATE INDEX idx_shifts_date ON public.shifts(shift_date);
CREATE INDEX idx_shifts_status ON public.shifts(status);

CREATE INDEX idx_board_posts_org ON public.board_posts(organization_id);
CREATE INDEX idx_board_posts_pinned ON public.board_posts(is_pinned) WHERE is_pinned = TRUE;

CREATE INDEX idx_todos_user ON public.todos(user_id);
CREATE INDEX idx_todos_completed ON public.todos(is_completed);

CREATE INDEX idx_files_org ON public.files(organization_id);
CREATE INDEX idx_files_uploaded_by ON public.files(uploaded_by);

CREATE INDEX idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals  ENABLE ROW LEVEL SECURITY;

-- ----- users policies -----
-- Users can read other users in the same organization
CREATE POLICY users_select_same_org ON public.users
  FOR SELECT USING (organization_id = public.get_my_org_id());

CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT WITH CHECK (
    organization_id = public.get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ----- reports policies -----
CREATE POLICY reports_select_same_org ON public.reports
  FOR SELECT USING (organization_id = public.get_my_org_id());

CREATE POLICY reports_insert_own ON public.reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY reports_update_own ON public.reports
  FOR UPDATE USING (user_id = auth.uid() AND status IN ('draft','rejected'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY reports_delete_own_draft ON public.reports
  FOR DELETE USING (user_id = auth.uid() AND status = 'draft');

-- ----- approvals policies -----
CREATE POLICY approvals_select_same_org ON public.approvals
  FOR SELECT USING (organization_id = public.get_my_org_id());

CREATE POLICY approvals_update_assignee ON public.approvals
  FOR UPDATE USING (assignee_id = auth.uid()) WITH CHECK (assignee_id = auth.uid());

CREATE POLICY approvals_insert ON public.approvals
  FOR INSERT WITH CHECK (requester_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. RLS helper function (SECURITY DEFINER to avoid infinite recursion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- 6. Trigger: auto-create approval when a report is submitted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_report_submitted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
    -- Create approval assigned to a manager in the same department
    INSERT INTO public.approvals (organization_id, report_id, assignee_id, requester_id, status)
    SELECT
      NEW.organization_id,
      NEW.id,
      mgr.id,
      NEW.user_id,
      'pending'
    FROM public.users author
    JOIN public.users mgr
      ON mgr.department_id = author.department_id
      AND mgr.organization_id = author.organization_id
      AND mgr.role IN ('manager','admin')
      AND mgr.is_active = TRUE
      AND mgr.id != author.id
    WHERE author.id = NEW.user_id
    LIMIT 1;

    NEW.submitted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_report_on_submit
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.on_report_submitted();

-- ---------------------------------------------------------------------------
-- 6. Seed Data
-- ---------------------------------------------------------------------------

-- Organization
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'パネット株式会社', 'panetto');

-- Offices (4)
INSERT INTO public.offices (id, organization_id, name, code) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', '東京本社',   'TOKYO'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', '横浜支社',   'YOKOHAMA'),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', '札幌支社',   'SAPPORO'),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', '福岡支社',   'FUKUOKA');

-- Departments (9)
INSERT INTO public.departments (id, organization_id, name, code, order_index) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '営業部',         'SALES',       1),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '画像制作部',     'IMAGE',       2),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', '動画制作部',     'VIDEO',       3),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', 'レタッチ部',     'RETOUCH',     4),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', '更新部',         'UPDATE_DEPT', 5),
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', '口コミ部',       'REVIEW',      6),
  ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000001', '求人部',         'RECRUIT',     7),
  ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000001', '情報システム部', 'IT',          8),
  ('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0000-000000000001', '人事労務総務部', 'HR',          9);

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
