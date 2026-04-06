'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function SyncTasukaruButton() {
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync/tasukaru', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        toast.error(`同期失敗: ${data.error}`)
        return
      }

      toast.success(
        `タス軽同期完了: ${data.synced}件取得 (新規${data.created} / 更新${data.updated} / 削除${data.deleted})`
      )

      // Reload the page to show updated data
      window.location.reload()
    } catch {
      toast.error('タス軽同期中にエラーが発生しました')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleSync} disabled={syncing}>
      <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? '同期中...' : 'タス軽同期'}
    </Button>
  )
}
