-- Add report_reviewer_id column to users table
ALTER TABLE public.users ADD COLUMN report_reviewer_id UUID
  REFERENCES public.users(id) ON DELETE SET NULL;

-- Update the on_report_submitted trigger function
-- Priority: 1) user's custom reviewer, 2) department manager, 3) fallback to same-dept manager/admin
CREATE OR REPLACE FUNCTION public.on_report_submitted()
RETURNS TRIGGER AS $$
DECLARE
  v_reviewer_id UUID;
BEGIN
  IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
    -- 1. Custom reviewer
    SELECT report_reviewer_id INTO v_reviewer_id
    FROM public.users WHERE id = NEW.user_id;

    -- 2. Department manager
    IF v_reviewer_id IS NULL THEN
      SELECT d.manager_id INTO v_reviewer_id
      FROM public.users u
      JOIN public.departments d ON d.id = u.department_id
      WHERE u.id = NEW.user_id AND d.manager_id IS NOT NULL;
    END IF;

    -- 3. Fallback: same-department manager/admin
    IF v_reviewer_id IS NULL THEN
      SELECT mgr.id INTO v_reviewer_id
      FROM public.users author
      JOIN public.users mgr ON mgr.department_id = author.department_id
        AND mgr.organization_id = author.organization_id
        AND mgr.role IN ('manager','admin')
        AND mgr.is_active = TRUE
        AND mgr.id != author.id
      WHERE author.id = NEW.user_id
      LIMIT 1;
    END IF;

    IF v_reviewer_id IS NOT NULL THEN
      INSERT INTO public.approvals (organization_id, report_id, assignee_id, requester_id, status)
      VALUES (NEW.organization_id, NEW.id, v_reviewer_id, NEW.user_id, 'pending');
    END IF;

    NEW.submitted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
