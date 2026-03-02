'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronDown, ClipboardCopy, ClipboardList, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { type PlannedTask } from '@/types/report'

interface CarryOverTask {
  id: string
  title: string
  estimated_hours: number | null
  report_date: string
  children: CarryOverTask[]
}

interface PlannedTaskCarryOverMenuProps {
  plannedTasks: PlannedTask[]
  setPlannedTasks: React.Dispatch<React.SetStateAction<PlannedTask[]>>
}

export function PlannedTaskCarryOverMenu({ plannedTasks, setPlannedTasks }: PlannedTaskCarryOverMenuProps) {
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [completedTasks, setCompletedTasks] = useState<CarryOverTask[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogLoading, setDialogLoading] = useState(false)

  const buildPlannedTasks = (
    sourceTasks: CarryOverTask[]
  ): { newTasks: PlannedTask[]; skippedCount: number } => {
    const existingTitles = new Set(
      plannedTasks
        .filter(t => t.title.trim())
        .map(t => t.title.trim().toLowerCase())
    )

    const newTasks: PlannedTask[] = []
    let skippedCount = 0

    for (const t of sourceTasks) {
      const normalizedTitle = (t.title || '').trim().toLowerCase()
      if (!normalizedTitle || existingTitles.has(normalizedTitle)) {
        if (normalizedTitle) skippedCount++
        continue
      }
      existingTitles.add(normalizedTitle)
      newTasks.push({
        id: crypto.randomUUID(),
        title: t.title,
        estimated_hours: t.estimated_hours?.toString() || '',
      })

      for (const child of t.children || []) {
        const childTitle = (child.title || '').trim().toLowerCase()
        if (!childTitle || existingTitles.has(childTitle)) {
          if (childTitle) skippedCount++
          continue
        }
        existingTitles.add(childTitle)
        newTasks.push({
          id: crypto.randomUUID(),
          title: child.title,
          estimated_hours: child.estimated_hours?.toString() || '',
        })
      }
    }

    return { newTasks, skippedCount }
  }

  const appendTasks = (newTasks: PlannedTask[]) => {
    setPlannedTasks(prev => {
      const existing = prev.filter(t => t.title.trim() !== '')
      return [...existing, ...newTasks]
    })
  }

  const fetchAndApply = async (mode: 'incomplete_latest' | 'incomplete_all') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/carry-over-tasks?mode=${mode}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const data: CarryOverTask[] = json.data || []
      if (data.length === 0) {
        toast.info('引き継ぎ可能なタスクがありません')
        return
      }

      const { newTasks, skippedCount } = buildPlannedTasks(data)

      if (newTasks.length === 0) {
        toast.info('全てのタスクが既に追加済みです')
        return
      }

      appendTasks(newTasks)

      let message = `${newTasks.length}件のタスクを引き継ぎました`
      if (skippedCount > 0) {
        message += `（${skippedCount}件は重複のためスキップ）`
      }
      toast.success(message)
    } catch (err: any) {
      toast.error(err.message || 'タスクの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const openCompletedDialog = async () => {
    setDialogOpen(true)
    setDialogLoading(true)
    setSelectedIds(new Set())
    setSearchQuery('')
    try {
      const res = await fetch('/api/reports/carry-over-tasks?mode=completed')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCompletedTasks(json.data || [])
    } catch (err: any) {
      toast.error(err.message || '完了タスクの取得に失敗しました')
      setCompletedTasks([])
    } finally {
      setDialogLoading(false)
    }
  }

  const toggleSelection = (taskId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const applyCompletedTasks = () => {
    const selected = completedTasks.filter(t => selectedIds.has(t.id))
    if (selected.length === 0) {
      toast.info('タスクを選択してください')
      return
    }

    const { newTasks, skippedCount } = buildPlannedTasks(selected)

    if (newTasks.length === 0) {
      toast.info('全てのタスクが既に追加済みです')
      setDialogOpen(false)
      return
    }

    appendTasks(newTasks)

    let message = `${newTasks.length}件のタスクを追加しました`
    if (skippedCount > 0) {
      message += `（${skippedCount}件は重複のためスキップ）`
    }
    toast.success(message)
    setDialogOpen(false)
  }

  const filteredCompletedTasks = completedTasks.filter(t =>
    (t.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCopy className="mr-1 h-4 w-4" />
            )}
            タスク引き継ぎ
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => fetchAndApply('incomplete_latest')}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            前日の未完了タスク
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fetchAndApply('incomplete_all')}>
            <ClipboardList className="mr-2 h-4 w-4" />
            全レポートの未完了タスク
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCompletedDialog}>
            <Search className="mr-2 h-4 w-4" />
            完了タスクから選択...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>完了タスクから選択</DialogTitle>
            <DialogDescription>
              過去90日間の完了タスクから選択して翌日の予定に追加できます。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="タスク名で検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />

            {dialogLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCompletedTasks.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {searchQuery ? '検索結果がありません' : '完了タスクがありません'}
              </div>
            ) : (
              <ScrollArea className="h-[300px] rounded-md border p-2">
                <div className="space-y-1">
                  {filteredCompletedTasks.map(task => (
                    <label
                      key={task.id}
                      className="flex items-start gap-3 rounded-md p-2 hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(task.id)}
                        onCheckedChange={() => toggleSelection(task.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.report_date}
                          {task.estimated_hours != null && ` / ${task.estimated_hours}h`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={applyCompletedTasks}
              disabled={selectedIds.size === 0 || dialogLoading}
            >
              {selectedIds.size > 0 ? `${selectedIds.size}件を追加` : '追加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
