import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, CheckSquare, Store, Users, TrendingUp, Clock, AlertCircle, ListTodo } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  // Get counts
  const today = new Date().toISOString().split('T')[0]

  const [reportsRes, pendingRes, usersRes, storesRes, storeTasksRes] = await Promise.all([
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('report_date', today),
    supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('stores').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('store_tasks').select('*', { count: 'exact', head: true }).neq('status', 'done'),
  ])

  const stats = [
    { label: '本日の日報', value: reportsRes.count || 0, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', href: '/dashboard/reports' },
    { label: '承認待ち', value: pendingRes.count || 0, icon: CheckSquare, color: 'text-orange-600', bg: 'bg-orange-50', href: '/dashboard/approvals/pending' },
    { label: '在籍人数', value: usersRes.count || 0, icon: Users, color: 'text-green-600', bg: 'bg-green-50', href: '/dashboard/organization/employees' },
    { label: '稼働店舗', value: storesRes.count || 0, icon: Store, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/stores' },
    { label: '店舗タスク', value: storeTasksRes.count || 0, icon: ListTodo, color: 'text-teal-600', bg: 'bg-teal-50', href: '/dashboard/portal/todo' },
  ]

  // Recent reports
  const { data: recentReports } = await supabase
    .from('reports')
    .select('*, user:users(name, department:departments!users_department_id_fkey(name))')
    .order('created_at', { ascending: false })
    .limit(10)

  // Pending approvals
  const { data: pendingApprovals } = await supabase
    .from('approvals')
    .select('*, report:reports(*, user:users(name)), requester:users!approvals_requester_id_fkey(name)')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(5)

  // Recent store tasks
  const { data: recentStoreTasks } = await supabase
    .from('store_tasks')
    .select('*')
    .neq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(5)

  const storeTaskStatusLabels: Record<string, { label: string; color: string }> = {
    todo: { label: '未着手', color: 'bg-gray-50 text-gray-700 border-gray-200' },
    doing: { label: '進行中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    blocked: { label: 'ブロック', color: 'bg-red-50 text-red-700 border-red-200' },
  }

  // Department stats: member count, today's report submissions, pending approvals
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, code')
    .eq('is_active', true)
    .order('order_index')

  const { data: deptUsers } = await supabase
    .from('users')
    .select('department_id')
    .eq('is_active', true)

  const { data: deptReports } = await supabase
    .from('reports')
    .select('department_id, status')
    .eq('report_date', today)

  // Build per-department stats
  const deptStats = (departments || []).map((dept: any) => {
    const memberCount = (deptUsers || []).filter((u: any) => u.department_id === dept.id).length
    const todayReports = (deptReports || []).filter((r: any) => r.department_id === dept.id)
    const submittedCount = todayReports.filter((r: any) => r.status !== 'draft').length
    const approvedCount = todayReports.filter((r: any) => r.status === 'approved').length
    const rate = memberCount > 0 ? Math.round((submittedCount / memberCount) * 100) : 0
    return { ...dept, memberCount, submittedCount, approvedCount, rate }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground">パネット業務ダッシュボード概要</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Store Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Store className="h-5 w-5 text-teal-500" />
                店舗タスク
              </CardTitle>
              <CardDescription>未完了 {storeTasksRes.count || 0}件</CardDescription>
            </div>
            <Link href="/dashboard/portal/todo" className="text-sm text-blue-600 hover:underline">全て表示</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentStoreTasks && recentStoreTasks.length > 0 ? recentStoreTasks.map((task: any) => {
                const st = storeTaskStatusLabels[task.status] || storeTaskStatusLabels.todo
                return (
                  <div key={task.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.store_name}
                        {task.start_date ? ` | 開始: ${task.start_date}` : ''}
                        {task.due_date ? ` | 終了: ${task.due_date}` : ''}
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

        {/* Pending Approvals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                承認待ち
              </CardTitle>
              <CardDescription>{pendingApprovals?.length || 0}件の承認待ち</CardDescription>
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
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">承認待ち</Badge>
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">承認待ちの日報はありません</p>
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
                    report.status === 'submitted' ? 'secondary' :
                    report.status === 'rejected' ? 'destructive' : 'outline'
                  }>
                    {report.status === 'approved' ? '承認済' :
                     report.status === 'submitted' ? '提出済' :
                     report.status === 'rejected' ? '却下' : '下書き'}
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
                  <span className="text-green-600">承認 {dept.approvedCount}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
