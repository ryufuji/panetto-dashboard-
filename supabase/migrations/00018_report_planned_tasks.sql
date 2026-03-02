CREATE TABLE report_planned_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  estimated_hours NUMERIC(5,2),
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE report_planned_tasks ENABLE ROW LEVEL SECURITY;

-- 同じ組織のユーザーが閲覧可能（reports の RLS に準拠）
CREATE POLICY "report_planned_tasks_select" ON report_planned_tasks
  FOR SELECT USING (
    report_id IN (SELECT id FROM reports)
  );

CREATE POLICY "report_planned_tasks_insert" ON report_planned_tasks
  FOR INSERT WITH CHECK (
    report_id IN (SELECT id FROM reports WHERE user_id = auth.uid())
  );

CREATE POLICY "report_planned_tasks_delete" ON report_planned_tasks
  FOR DELETE USING (
    report_id IN (SELECT id FROM reports WHERE user_id = auth.uid())
  );
