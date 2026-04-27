'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X } from 'lucide-react'

interface Props {
  departments: { id: string; name: string }[]
  /** どのページに対してクエリを発行するか（"/dashboard/reports" or "/dashboard/reports/gantt"） */
  basePath?: string
  /** クエリ保持したいstaticな値 (例: gantt の days, status filter等) */
  preservedKeys?: string[]
}

/**
 * 日報一覧/ガントチャート共通の名前+部署フィルタ。
 * 入力後「適用」を押すと searchParams を更新して再描画。
 */
export function ReportListFilters({
  departments,
  basePath = '/dashboard/reports',
  preservedKeys = ['status', 'date'],
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [userQuery, setUserQuery] = useState(searchParams.get('user') || '')
  const [departmentId, setDepartmentId] = useState(searchParams.get('department') || '__all__')

  const apply = () => {
    const sp = new URLSearchParams()
    // 既存のキーを保持
    for (const k of preservedKeys) {
      const v = searchParams.get(k)
      if (v) sp.set(k, v)
    }
    if (userQuery.trim()) sp.set('user', userQuery.trim())
    if (departmentId && departmentId !== '__all__') sp.set('department', departmentId)
    sp.set('page', '1')
    router.push(`${basePath}?${sp.toString()}`)
  }

  const clear = () => {
    setUserQuery('')
    setDepartmentId('__all__')
    const sp = new URLSearchParams()
    for (const k of preservedKeys) {
      const v = searchParams.get(k)
      if (v) sp.set(k, v)
    }
    router.push(sp.toString() ? `${basePath}?${sp.toString()}` : basePath)
  }

  const hasActiveFilter = !!userQuery.trim() || (departmentId && departmentId !== '__all__')

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">名前</label>
        <Input
          placeholder="例: 山田"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="h-9 w-44"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">部署</label>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">すべて</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={apply} size="sm" className="h-9">適用</Button>
      {hasActiveFilter && (
        <Button onClick={clear} size="sm" variant="ghost" className="h-9 gap-1">
          <X className="h-3 w-3" />クリア
        </Button>
      )}
    </div>
  )
}
