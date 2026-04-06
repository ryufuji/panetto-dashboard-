Run the full integration test suite for the Panetto Dashboard.

Execute: `bash scripts/run-tests.sh`

This script tests all major features:
- Authentication & middleware
- Report CRUD & submission
- Approval workflow (auto-generation, approval, rejection)
- Approval requests (multi-step threshold-based)
- Tasukaru (タス軽) webhook integration
- PANET API integration
- Organization, store, shift, sales, handover data access
- Settings & audit logs

Report the results summary (PASS/FAIL/SKIP counts) and highlight any failures.
