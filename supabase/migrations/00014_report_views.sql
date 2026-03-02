-- =============================================
-- 日報閲覧記録テーブル
-- =============================================

CREATE TABLE public.report_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(report_id, user_id)
);

-- RLS
ALTER TABLE public.report_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_views_select" ON public.report_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      JOIN public.users u ON u.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
      WHERE r.id = report_id
    )
  );
CREATE POLICY "report_views_insert" ON public.report_views
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );
CREATE POLICY "report_views_update" ON public.report_views
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- インデックス
CREATE INDEX idx_report_views_report ON public.report_views(report_id);
CREATE INDEX idx_report_views_user ON public.report_views(user_id);
