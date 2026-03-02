-- =============================================
-- 00016: RLS修正 - 日報確認フローを正しく動作させる
-- =============================================

-- 1. approvals: 同一組織のユーザーが確認（UPDATE）できるようにする
DROP POLICY IF EXISTS approvals_update_assignee ON public.approvals;
CREATE POLICY approvals_update_same_org ON public.approvals
  FOR UPDATE USING (organization_id = public.get_my_org_id());

-- 2. reports: 確認者がレポートのステータスを更新できるようにする
--    既存の reports_update_own は本人のみ (draft/rejected 時) → 残す
--    新規: 同一組織ユーザーが submitted → approved に変更可能
DROP POLICY IF EXISTS reports_update_approval ON public.reports;
CREATE POLICY reports_update_approval ON public.reports
  FOR UPDATE
  USING (organization_id = public.get_my_org_id() AND status = 'submitted')
  WITH CHECK (organization_id = public.get_my_org_id());

-- 3. approval_history: RLS有効化 + ポリシー追加
ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_history_select_same_org ON public.approval_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.approvals a
      WHERE a.id = approval_id
      AND a.organization_id = public.get_my_org_id()
    )
  );

CREATE POLICY approval_history_insert_authenticated ON public.approval_history
  FOR INSERT WITH CHECK (user_id = auth.uid());
