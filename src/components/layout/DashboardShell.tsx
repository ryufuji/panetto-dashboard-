'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import type { User, Office } from '@/lib/supabase/types'

interface ShellUser extends User {
  office?: Office
}

/**
 * ダッシュボードの外枠。モバイルでメニューを開いているかの状態を持つ。
 * サイドバーはモバイルでは画面に重ねて出すため、ヘッダーのボタンと
 * サイドバー本体の両方から同じ状態を触る必要があり、ここで保持する。
 */
export function DashboardShell({
  user,
  children,
}: {
  user: ShellUser | null
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* メニューを重ねて表示している間の背景。タップで閉じる */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuToggle={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 lg:p-6 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  )
}
