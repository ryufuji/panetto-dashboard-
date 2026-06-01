-- タスクテンプレート
CREATE TABLE report_task_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- テンプレートの各タスク（親・子両対応）
CREATE TABLE report_task_template_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES report_task_templates(id) ON DELETE CASCADE,
  parent_item_id UUID REFERENCES report_task_template_items(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  estimated_hours NUMERIC,
  order_index    INTEGER NOT NULL DEFAULT 0,
  task_type      TEXT,
  priority       TEXT NOT NULL DEFAULT 'medium',
  purpose        TEXT,
  memo           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_templates_org ON report_task_templates(organization_id);
CREATE INDEX idx_task_template_items_tmpl ON report_task_template_items(template_id);
CREATE INDEX idx_task_template_items_parent ON report_task_template_items(parent_item_id);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_task_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_task_templates_updated_at
  BEFORE UPDATE ON report_task_templates
  FOR EACH ROW EXECUTE FUNCTION update_task_templates_updated_at();

-- RLS
ALTER TABLE report_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_task_template_items ENABLE ROW LEVEL SECURITY;

-- 同組織のユーザーは参照可能
CREATE POLICY "org members can view templates"
  ON report_task_templates FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

-- 管理者のみ作成・更新・削除
CREATE POLICY "admins can insert templates"
  ON report_task_templates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = report_task_templates.organization_id
  ));
CREATE POLICY "admins can update templates"
  ON report_task_templates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = report_task_templates.organization_id
  ));
CREATE POLICY "admins can delete templates"
  ON report_task_templates FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = report_task_templates.organization_id
  ));

-- template_items は template の権限に準拠
CREATE POLICY "org members can view template items"
  ON report_task_template_items FOR SELECT
  USING (template_id IN (
    SELECT id FROM report_task_templates
    WHERE organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  ));
CREATE POLICY "admins can manage template items"
  ON report_task_template_items FOR ALL
  USING (template_id IN (
    SELECT id FROM report_task_templates
    WHERE organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM report_task_templates
    WHERE organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  ));
