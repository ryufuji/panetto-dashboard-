import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Store, Users, TrendingUp, Clock, ListTodo, CalendarClock, ClipboardList, Eye } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  // JST (UTC+9) 基準の今日。サーバーがUTCで動くため、UTC midnight直後でも
  // 日本時間で正しい日付になるよう+9hシフトしてから日付部分を切り出す。
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const [
    reportsRes,
    pendingRes,
    usersRes,
    storesRes,
    storeTasksRes,
    pendingRequestsRes,
  ] = await Promise.all([
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('report_date', today),
    supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('stores').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('store_daily_report_tasks').select('*', { count: 'exact', head: true }).neq('status', 'done'),
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const kpis = {
    reports: reportsRes.count || 0,
    pending: pendingRes.count || 0,
    users: usersRes.count || 0,
    stores: storesRes.count || 0,
    storeTasks: storeTasksRes.count || 0,
    pendingRequests: pendingRequestsRes.count || 0,
  }

  const stats = [
    { label: '本日の日報', value: kpis.reports, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', href: '/dashboard/reports' },
    { label: '未確認日報', value: kpis.pending, icon: Eye, color: 'text-orange-600', bg: 'bg-orange-50', href: '/dashboard/approvals/pending' },
    { label: '承認待ち申請', value: kpis.pendingRequests, icon: ClipboardList, color: 'text-red-600', bg: 'bg-red-50', href: '/dashboard/approval-requests' },
    { label: '在籍人数', value: kpis.users, icon: Users, color: 'text-green-600', bg: 'bg-green-50', href: '/dashboard/organization/employees' },
    { label: '稼働店舗', value: kpis.stores, icon: Store, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/stores' },
    { label: '店舗タスク', value: kpis.storeTasks, icon: ListTodo, color: 'text-teal-600', bg: 'bg-teal-50', href: '/dashboard/reports' },
  ]

  // Run all remaining queries in parallel
  const [
    { data: recentReports },
    { data: pendingApprovals },
    { data: pendingRequests },
    { data: recentStoreTasks },
    { data: pendingExtensions },
    { data: departments },
    { data: deptUsers },
    { data: deptReports },
  ] = await Promise.all([
    supabase
      .from('reports')
      .select('id, report_date, status, user:users(name, department:departments!users_department_id_fkey(name))')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('approvals')
      .select('id, status, report:reports(report_date, user:users(name)), requester:users!approvals_requester_id_fkey(name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(5),
    supabase
      .from('approval_requests')
      .select('id, title, created_at, requester:users!approval_requests_requester_id_fkey(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('store_daily_report_tasks')
      .select('id, title, status, start_date, due_date, report:store_daily_reports!inner(store_name, external_user_name)')
      .neq('status', 'done')
      .order('synced_at', { ascending: false })
      .limit(5),
    authUser
      ? supabase
          .from('deadline_extension_requests')
          .select('id, report_id, task_title, original_due_date, proposed_due_date, created_at, requester:users!deadline_extension_requests_requester_id_fkey(name)')
          .eq('approver_id', authUser.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
    supabase
      .from('departments')
      .select('id, name, code')
      .eq('is_active', true)
      .order('order_index'),
    supabase.from('users').select('department_id').eq('is_active', true),
    supabase.from('reports').select('department_id, status').eq('report_date', today),
  ])

  const storeTaskStatusLabels: Record<string, { label: string; color: string }> = {
    todo: { label: '未着手', color: 'bg-gray-50 text-gray-700 border-gray-200' },
    doing: { label: '進行中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    in_progress: { label: '進行中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    blocked: { label: 'ブロック', color: 'bg-red-50 text-red-700 border-red-200' },
    done: { label: '完了', color: 'bg-green-50 text-green-700 border-green-200' },
  }

  // Build per-department stats using O(n) Map lookups instead of O(n*m) filter
  const memberMap = new Map<string, number>()
  for (const u of (deptUsers || []) as any[]) {
    if (!u.department_id) continue
    memberMap.set(u.department_id, (memberMap.get(u.department_id) || 0) + 1)
  }
  const submittedMap = new Map<string, number>()
  const approvedMap = new Map<string, number>()
  for (const r of (deptReports || []) as any[]) {
    if (!r.department_id) continue
    if (r.status !== 'draft') submittedMap.set(r.department_id, (submittedMap.get(r.department_id) || 0) + 1)
    if (r.status === 'approved') approvedMap.set(r.department_id, (approvedMap.get(r.department_id) || 0) + 1)
  }
  const deptStats = (departments || []).map((dept: any) => {
    const memberCount = memberMap.get(dept.id) || 0
    const submittedCount = submittedMap.get(dept.id) || 0
    const approvedCount = approvedMap.get(dept.id) || 0
    const rate = memberCount > 0 ? Math.round((submittedCount / memberCount) * 100) : 0
    return { ...dept, memberCount, submittedCount, approvedCount, rate }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground">業務日報ダッシュボード概要</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pending Deadline Extensions */}
      {pendingExtensions && pendingExtensions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-amber-500" />
                期限延長依頼
              </CardTitle>
              <CardDescription>{pendingExtensions.length}件の延長依頼</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingExtensions.map((ext: any) => (
                <Link key={ext.id} href={`/dashboard/reports/${ext.report_id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{ext.task_title}</p>
                    <p className="text-xs text-muted-foreground">
                      申請者: {ext.requester?.name || '不明'} | {ext.original_due_date} → {ext.proposed_due_date}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      申請日: {new Date(ext.created_at).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 shrink-0">承認待ち</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Unconfirmed Reports */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5 text-orange-500" />
                未確認日報
              </CardTitle>
              <CardDescription>{pendingApprovals?.length || 0}件の未確認</CardDescription>
            </div>
            <Link href="/dashboard/approvals/pending" className="text-sm text-blue-600 hover:underline">全て表示</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingApprovals && pendingApprovals.length > 0 ? pendingApprovals.map((approval: any) => (
                <Link key={approval.id} href={`/dashboard/approvals/${approval.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-sm">{approval.requester?.name}</p>
                    <p className="text-xs text-muted-foreground">{approval.report?.report_date}</p>
                  </div>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">未確認</Badge>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">未確認の日報はありません</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pending Approval Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-red-500" />
                承認待ち申請
              </CardTitle>
              <CardDescription>{pendingRequests?.length || 0}件の承認待ち</CardDescription>
            </div>
            <Link href="/dashboard/approval-requests" className="text-sm text-blue-600 hover:underline">全て表示</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests && pendingRequests.length > 0 ? pendingRequests.map((req: any) => (
                <Link key={req.id} href={`/dashboard/approval-requests/${req.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-sm">{req.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.requester?.name} | {new Date(req.created_at).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">承認待ち</Badge>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">承認待ちの申請はありません</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Store Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Store className="h-5 w-5 text-teal-500" />
                店舗タスク
              </CardTitle>
              <CardDescription>未完了 {kpis.storeTasks}件（タス軽くん）</CardDescription>
            </div>
            <Link href="/dashboard/reports" className="text-sm text-blue-600 hover:underline">全て表示</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentStoreTasks && recentStoreTasks.length > 0 ? recentStoreTasks.map((task: any) => {
                const st = storeTaskStatusLabels[task.status] || storeTaskStatusLabels.todo
                const storeName = task.report?.store_name
                const userName = task.report?.external_user_name
                return (
                  <div key={task.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[storeName, userName].filter(Boolean).join(' / ')}
                        {task.due_date ? ` | 期限: ${task.due_date}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className={st.color}>{st.label}</Badge>
                  </div>
                )
              }) : (
                <p className="text-sm text-muted-foreground text-center py-4">店舗タスクはありません</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Reports */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                最近の日報
              </CardTitle>
              <CardDescription>直近の日報提出状況</CardDescription>
            </div>
            <Link href="/dashboard/reports" className="text-sm text-blue-600 hover:underline">全て表示</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentReports && recentReports.length > 0 ? recentReports.map((report: any) => (
                <Link key={report.id} href={`/dashboard/reports/${report.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-sm">{report.user?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.user?.department?.name} | {report.report_date}
                    </p>
                  </div>
                  <Badge variant={
                    report.status === 'approved' ? 'default' :
                    report.status === 'submitted' ? 'secondary' : 'outline'
                  }>
                    {report.status === 'approved' ? '確認済' :
                     report.status === 'submitted' ? '提出済' : '下書き'}
                  </Badge>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">日報データがありません</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Department Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            部署別概要
          </CardTitle>
          <CardDescription>本日の日報提出状況</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {deptStats.map((dept: any) => (
              <div key={dept.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{dept.name}</p>
                  <Badge variant="outline" className="text-xs">{dept.code}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        dept.rate >= 80 ? 'bg-green-500' : dept.rate >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                      }`}
                      style={{ width: `${dept.rate}%` }}
                    />
                  </div>
                  <span className={`text-sm font-semibold min-w-[3rem] text-right ${
                    dept.rate >= 80 ? 'text-green-600' : dept.rate >= 50 ? 'text-yellow-600' : 'text-red-500'
                  }`}>{dept.rate}%</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {dept.memberCount}名
                  </span>
                  <span>提出 {dept.submittedCount}/{dept.memberCount}</span>
                  <span className="text-green-600">確認 {dept.approvedCount}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
