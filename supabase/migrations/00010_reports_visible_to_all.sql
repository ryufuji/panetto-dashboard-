-- Revert to organization-wide visibility: all users can see all reports in their org
DROP POLICY IF EXISTS reports_select_by_role ON public.reports;

CREATE POLICY reports_select_same_org ON public.reports
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
  );
