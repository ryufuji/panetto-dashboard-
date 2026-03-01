'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, ListTodo, Store, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const statusLabels: Record<string, { label: string; color: string }> = {
  todo: { label: '未着手', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  doing: { label: '進行中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  done: { label: '完了', color: 'bg-green-50 text-green-700 border-green-200' },
  blocked: { label: 'ブロック', color: 'bg-red-50 text-red-700 border-red-200' },
}

const categoryLabels: Record<string, string> = {
  general: '一般',
  improvement: '改善',
  hq_request: '本部依頼',
  trouble: 'トラブル',
  routine: '定常',
}

export default function TodoPage() {
  const supabase = createClient()
  const [todos, setTodos] = useState<any[]>([])
  const [storeTasks, setStoreTasks] = useState<any[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newStartDate, setNewStartDate] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [loadingStore, setLoadingStore] = useState(true)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('todos').select('*').eq('user_id', user.id).order('is_completed').order('order_index')
    setTodos(data || [])
  }

  const loadStoreTasks = async () => {
    setLoadingStore(true)
    const { data } = await supabase
      .from('store_tasks')
      .select('*')
      .order('created_at', { ascending: false })
    setStoreTasks(data || [])
    setLoadingStore(false)
  }

  useEffect(() => { load(); loadStoreTasks() }, [])

  const addTodo = async () => {
    if (!newTitle.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('todos').insert({
      user_id: user.id, title: newTitle, priority: newPriority,
      start_date: newStartDate || null,
      due_date: newDueDate || null, order_index: todos.length,
    })
    setNewTitle(''); setNewStartDate(''); setNewDueDate('')
    toast.success('追加しました')
    load()
  }

  const toggleComplete = async (id: string, current: boolean) => {
    await supabase.from('todos').update({
      is_completed: !current, completed_at: !current ? new Date().toISOString() : null,
    }).eq('id', id)
    load()
  }

  const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    toast.success('削除しました')
    load()
  }

  const filtered = todos.filter(t =>
    filter === 'all' ? true : filter === 'active' ? !t.is_completed : t.is_completed
  )

  const filteredStoreTasks = storeTasks.filter(t =>
    storeFilter === 'all' ? true : t.status === storeFilter
  )

  const priorityColor = (p: string) => p === 'high' ? 'destructive' : p === 'low' ? 'outline' : 'secondary'
  const priorityLabel = (p: string) => p === 'high' ? '高' : p === 'low' ? '低' : '中'

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">ToDo</h1>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal" className="gap-2">
            <ListTodo className="h-4 w-4" />
            個人ToDo
          </TabsTrigger>
          <TabsTrigger value="store" className="gap-2">
            <Store className="h-4 w-4" />
            店舗タスク
            {storeTasks.filter(t => t.status !== 'done').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {storeTasks.filter(t => t.status !== 'done').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 個人ToDo */}
        <TabsContent value="personal">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input placeholder="新しいタスク..." value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()} className="flex-1" />
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="low">低</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={addTodo}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">開始予定日</span>
                  <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">終了予定日</span>
                  <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                {(['all', 'active', 'completed'] as const).map(f => (
                  <Badge key={f} variant={filter === f ? 'default' : 'outline'} className="cursor-pointer"
                    onClick={() => setFilter(f)}>{f === 'all' ? '全て' : f === 'active' ? '未完了' : '完了'}</Badge>
                ))}
              </div>
              <div className="space-y-2">
                {filtered.map(todo => (
                  <div key={todo.id} className={`flex items-center gap-3 rounded-lg border p-3 ${todo.is_completed ? 'opacity-50' : ''}`}>
                    <Checkbox checked={todo.is_completed} onCheckedChange={() => toggleComplete(todo.id, todo.is_completed)} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${todo.is_completed ? 'line-through' : ''}`}>{todo.title}</p>
                      <div className="flex gap-2">
                        {todo.start_date && <p className="text-xs text-muted-foreground">開始: {todo.start_date}</p>}
                        {todo.due_date && <p className="text-xs text-muted-foreground">終了: {todo.due_date}</p>}
                      </div>
                    </div>
                    <Badge variant={priorityColor(todo.priority) as any}>{priorityLabel(todo.priority)}</Badge>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteTodo(todo.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ListTodo className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>タスクはありません</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 店舗タスク */}
        <TabsContent value="store">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'all', label: '全て' },
                  { value: 'todo', label: '未着手' },
                  { value: 'doing', label: '進行中' },
                  { value: 'done', label: '完了' },
                  { value: 'blocked', label: 'ブロック' },
                ].map(f => (
                  <Badge
                    key={f.value}
                    variant={storeFilter === f.value ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setStoreFilter(f.value)}
                  >
                    {f.label}
                  </Badge>
                ))}
              </div>

              {loadingStore ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStoreTasks.map(task => {
                    const st = statusLabels[task.status] || statusLabels.todo
                    return (
                      <div key={task.id} className={`flex items-center gap-3 rounded-lg border p-3 ${task.status === 'done' ? 'opacity-50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium truncate">{task.title}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">
                              <Store className="h-3 w-3 mr-1" />店舗
                            </Badge>
                            <span className="text-xs text-muted-foreground">{task.store_name}</span>
                            {task.assignee_name && (
                              <span className="text-xs text-muted-foreground">担当: {task.assignee_name}</span>
                            )}
                            {task.start_date && (
                              <span className="text-xs text-muted-foreground">開始: {task.start_date}</span>
                            )}
                            {task.due_date && (
                              <span className="text-xs text-muted-foreground">終了: {task.due_date}</span>
                            )}
                            {task.category && task.category !== 'general' && (
                              <Badge variant="outline" className="text-xs">{categoryLabels[task.category] || task.category}</Badge>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className={st.color}>{st.label}</Badge>
                        <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'low' ? 'outline' : 'secondary'}>
                          {task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '中'}
                        </Badge>
                      </div>
                    )
                  })}
                  {filteredStoreTasks.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Store className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p>店舗タスクはありません</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
