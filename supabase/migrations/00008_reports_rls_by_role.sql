-- Helper functions (SECURITY DEFINER to bypass RLS on users table)

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS UUID AS $$
  SELECT department_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_report_reviewer_of(target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = target_user_id
    AND report_reviewer_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop the old permissive policy
DROP POLICY IF EXISTS reports_select_same_org ON public.reports;

-- New policy: role-based visibility
--   admin    → all reports in the organization
--   manager  → own department + users they review + own reports
--   employee → own reports + users they review (edge case)
CREATE POLICY reports_select_by_role ON public.reports
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND (
      user_id = auth.uid()
      OR public.get_my_role() = 'admin'
      OR (public.get_my_role() = 'manager' AND department_id = public.get_my_department_id())
      OR public.is_report_reviewer_of(user_id)
    )
  );
