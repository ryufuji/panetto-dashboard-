'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, CheckSquare, Store,
  Building2, Settings, ChevronLeft, ChevronRight,
  Users, ClipboardList, BarChart3, AlertTriangle, Bug, LayoutTemplate
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const navigation = [
  { name: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { name: '日報管理', icon: FileText, children: [
    { name: '日報一覧', href: '/dashboard/reports' },
    { name: '日報作成', href: '/dashboard/reports/new' },
    { name: '下書き', href: '/dashboard/reports/drafts' },
    { name: '期日遅れタスク', href: '/dashboard/reports/overdue' },
    // テンプレート機能は実装未完了のため一時的に非表示。再開時はこの行のコメントを外す:
    // { name: 'テンプレート', href: '/dashboard/reports/templates' },
    { name: 'ガントチャート', href: '/dashboard/reports/gantt' },
    // カレンダー機能は一時的に非表示。再開時はこの行のコメントを外す:
    // { name: 'カレンダー', href: '/dashboard/reports/calendar' },
    { name: '月次レポート', href: '/dashboard/reports/monthly' },
  ]},
  { name: '承認確認', icon: CheckSquare, children: [
    // 自分が承認すべき申請 / 自分が処理済みの申請を扱う
    // (旧 /approvals/* は日報用だったため廃止)
    { name: '承認待ち', href: '/dashboard/approval-requests?tab=pending_approval' },
    { name: '承認済み', href: '/dashboard/approval-requests?tab=approved_by_me' },
  ]},
  { name: 'パフォーマンス分析', icon: BarChart3, children: [
    { name: '社員ランキング', href: '/dashboard/performance' },
    { name: '部署比較', href: '/dashboard/performance/departments' },
  ]},
  { name: '申請管理', icon: ClipboardList, children: [
    { name: '申請一覧', href: '/dashboard/approval-requests' },
    { name: '新規申請', href: '/dashboard/approval-requests/new' },
    { name: '承認設定', href: '/dashboard/approval-requests/settings' },
  ]},
  { name: '店舗運営', icon: Store, children: [
    { name: '店舗一覧', href: '/dashboard/stores' },
    { name: '新規店舗', href: '/dashboard/stores/new' },
  ]},
  { name: '組織管理', icon: Building2, children: [
    { name: '組織図', href: '/dashboard/organization/chart' },
    { name: '部署管理', href: '/dashboard/organization/departments' },
    { name: '拠点管理', href: '/dashboard/organization/offices' },
    { name: '社員管理', href: '/dashboard/organization/employees' },
    { name: '権限管理', href: '/dashboard/organization/permissions' },
    { name: 'タスクテンプレート', href: '/dashboard/organization/task-templates', icon: LayoutTemplate },
  ]},
  { name: '設定', icon: Settings, children: [
    { name: 'プロフィール', href: '/dashboard/settings/profile' },
    { name: 'システム設定', href: '/dashboard/settings/system' },
    { name: '監査ログ', href: '/dashboard/settings/audit-logs' },
  ]},
  { name: 'バグ報告', href: 'https://docs.google.com/spreadsheets/d/1j7C9Rhs8tWsxECq7BoNdyF0Nb2KfRRh47qeMDSllwl4/edit?gid=762673576#gid=762673576', icon: Bug, external: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openMenus, setOpenMenus] = useState<string[]>(['日報管理', '承認確認'])
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch('/api/approval-requests?tab=pending_approval')
        .then(r => r.json())
        .then(j => setPendingApprovalCount(j.data?.length || 0))
        .catch(() => {})
    })
  }, [])

  const toggleMenu = (name: string) => {
    setOpenMenus(prev =>
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    )
  }

  return (
    <aside className={cn(
      'flex flex-col border-r bg-white dark:bg-slate-950 transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm">パネット</span>
          </Link>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navigation.map((item) => {
          if (item.href) {
            const isActive = !item.external && pathname === item.href
            const linkProps = item.external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {}
            return (
              <Link key={item.name} href={item.href} {...linkProps}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                )}>
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )
          }

          const isOpen = openMenus.includes(item.name)
          // 子メニューの中で「最長プレフィックスマッチ」したものだけをアクティブにする
          // 例: pathname='/dashboard/reports/new' のとき、'/dashboard/reports' と
          // '/dashboard/reports/new' の両方がprefixに一致するが、長い方のみ active
          const activeChildHref = (() => {
            let best: string | null = null
            for (const c of item.children || []) {
              // query string (?tab=...) は除いて pathname と比較
              const cPath = c.href.split('?')[0]
              if (pathname === cPath || pathname.startsWith(cPath + '/')) {
                if (!best || c.href.length > best.length) best = c.href
              }
            }
            return best
          })()
          const hasActiveChild = !!activeChildHref

          return (
            <div key={item.name}>
              <button onClick={() => toggleMenu(item.name)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  hasActiveChild ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                )}>
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.name}</span>
                    <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
                  </>
                )}
              </button>
              {!collapsed && isOpen && item.children && (
                <div className="ml-4 mt-1 space-y-1 border-l pl-4">
                  {item.children.map((child) => {
                    const isActive = activeChildHref === child.href
                    return (
                      <Link key={child.href} href={child.href}
                        className={cn(
                          'flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors',
                          isActive ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800'
                        )}>
                        <span>{child.name}</span>
                        {child.name === '承認待ち' && pendingApprovalCount > 0 && (
                          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                            {pendingApprovalCount}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
