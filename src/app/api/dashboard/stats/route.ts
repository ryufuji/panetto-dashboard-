import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [
      allReportsResult,
      draftReportsResult,
      submittedReportsResult,
      approvedReportsResult,
      rejectedReportsResult,
      approvalsResult,
      departmentsResult,
      storesResult,
    ] = await Promise.all([
      supabase.from('reports').select('*', { count: 'exact', head: true }),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft'),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved'),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected'),
      supabase
        .from('approvals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('reports')
        .select('department_id, status, department:departments(name)'),
      supabase.from('store_sales').select('store_id, amount'),
    ])

    const totalReports = allReportsResult.count ?? 0
    const draftCount = draftReportsResult.count ?? 0
    const submittedCount = submittedReportsResult.count ?? 0
    const approvedCount = approvedReportsResult.count ?? 0
    const rejectedCount = rejectedReportsResult.count ?? 0
    const pendingApprovals = approvalsResult.count ?? 0

    const approvalRate =
      approvedCount + rejectedCount > 0
        ? Math.round(
            (approvedCount / (approvedCount + rejectedCount)) * 100
          )
        : 0

    const departmentStats: Record<
      string,
      { name: string; total: number; submitted: number; approved: number }
    > = {}

    if (departmentsResult.data) {
      for (const report of departmentsResult.data) {
        const deptId = report.department_id
        if (!deptId) continue

        if (!departmentStats[deptId]) {
          departmentStats[deptId] = {
            name: (report.department as unknown as { name: string } | null)?.name ?? 'Unknown',
            total: 0,
            submitted: 0,
            approved: 0,
          }
        }

        departmentStats[deptId].total++

        if (report.status === 'submitted' || report.status === 'approved') {
          departmentStats[deptId].submitted++
        }

        if (report.status === 'approved') {
          departmentStats[deptId].approved++
        }
      }
    }

    const storePerformance: Record<
      string,
      { total_sales: number; total_amount: number }
    > = {}

    if (storesResult.data) {
      for (const sale of storesResult.data) {
        const storeId = sale.store_id
        if (!storeId) continue

        if (!storePerformance[storeId]) {
          storePerformance[storeId] = { total_sales: 0, total_amount: 0 }
        }

        storePerformance[storeId].total_sales++
        storePerformance[storeId].total_amount += sale.amount || 0
      }
    }

    return NextResponse.json({
      data: {
        reports: {
          total: totalReports,
          draft: draftCount,
          submitted: submittedCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
        approvals: {
          pending: pendingApprovals,
          approval_rate: approvalRate,
        },
        departments: Object.entries(departmentStats).map(
          ([id, stats]) => ({
            department_id: id,
            ...stats,
            submission_rate:
              stats.total > 0
                ? Math.round((stats.submitted / stats.total) * 100)
                : 0,
          })
        ),
        store_performance: Object.entries(storePerformance).map(
          ([id, stats]) => ({
            store_id: id,
            ...stats,
          })
        ),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
