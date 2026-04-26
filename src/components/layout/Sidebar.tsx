'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, CheckSquare, Store,
  Building2, Settings, ChevronLeft, ChevronRight,
  Users, ClipboardList, BarChart3
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { name: '日報管理', icon: FileText, children: [
    { name: '日報一覧', href: '/dashboard/reports' },
    { name: '日報作成', href: '/dashboard/reports/new' },
    { name: '下書き', href: '/dashboard/reports/drafts' },
    // テンプレート機能は実装未完了のため一時的に非表示。再開時はこの行のコメントを外す:
    // { name: 'テンプレート', href: '/dashboard/reports/templates' },
    { name: 'ガントチャート', href: '/dashboard/reports/gantt' },
    { name: 'カレンダー', href: '/dashboard/reports/calendar' },
    { name: '月次レポート', href: '/dashboard/reports/monthly' },
  ]},
  { name: '日報確認', icon: CheckSquare, children: [
    { name: '確認待ち', href: '/dashboard/approvals/pending' },
    { name: '確認済み', href: '/dashboard/approvals/approved' },
    { name: '統計', href: '/dashboard/approvals/statistics' },
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
  ]},
  { name: '設定', icon: Settings, children: [
    { name: 'プロフィール', href: '/dashboard/settings/profile' },
    { name: 'システム設定', href: '/dashboard/settings/system' },
    { name: '監査ログ', href: '/dashboard/settings/audit-logs' },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openMenus, setOpenMenus] = useState<string[]>(['日報管理', '日報確認'])

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
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href}
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
          const hasActiveChild = item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))

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
                    const isActive = pathname === child.href || pathname.startsWith(child.href + '/')
                    return (
                      <Link key={child.href} href={child.href}
                        className={cn(
                          'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                          isActive ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800'
                        )}>
                        {child.name}
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
