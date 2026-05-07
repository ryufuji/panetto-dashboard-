'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { LogOut, Settings, User as UserIcon, Menu, ShieldCheck } from 'lucide-react'
import type { User, Office } from '@/lib/supabase/types'

interface HeaderUser extends User {
  office?: Office
}

interface HeaderProps {
  user: HeaderUser | null
  onMenuToggle?: () => void
}

export function Header({ user, onMenuToggle }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = user?.name?.slice(0, 2) || '?'
  const officeName = user?.office?.name || ''
  const positionLabel = user?.position || ''
  const subtitleParts = [officeName, positionLabel].filter(Boolean).join('/')
  const isAdmin = user?.role === 'admin'

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 dark:bg-slate-950">
      <div className="flex items-center gap-4">
        <button onClick={onMenuToggle} className="rounded-lg p-2 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-800">
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">業務日報ダッシュボード</h2>
        {/* 閲覧用 (氏名/拠点・役職) */}
        {user && (
          <span className="hidden md:inline-flex items-center gap-2 rounded bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">
            <span className="font-medium">閲覧用</span>
            <span className="text-emerald-600">
              {user.name}
              {subtitleParts && <span className="text-emerald-500"> ({subtitleParts})</span>}
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Button asChild variant="ghost" size="sm" className="text-blue-600">
            <a href="/dashboard/organization/employees">
              <ShieldCheck className="mr-1 h-4 w-4" />管理画面
            </a>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:block">{user?.name || 'ユーザー'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings/profile')}>
              <UserIcon className="mr-2 h-4 w-4" />プロフィール
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings/system')}>
              <Settings className="mr-2 h-4 w-4" />設定
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />ログアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
