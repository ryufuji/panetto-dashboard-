-- 承認ステップに「委任(delegated)」ステータスを追加
ALTER TABLE public.approval_request_steps
  DROP CONSTRAINT approval_request_steps_status_check,
  ADD CONSTRAINT approval_request_steps_status_check
    CHECK (status IN ('pending','approved','rejected','delegated'));

-- 履歴に「委任(delegated)」アクションを追加
ALTER TABLE public.approval_request_history
  DROP CONSTRAINT approval_request_history_action_check,
  ADD CONSTRAINT approval_request_history_action_check
    CHECK (action IN ('created','submitted','approved','rejected','cancelled','delegated'));
