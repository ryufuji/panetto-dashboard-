import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Users, GitBranch } from 'lucide-react'

interface DepartmentNode {
  id: string
  name: string
  code: string
  description?: string
  manager_id?: string
  parent_department_id?: string | null
  order_index: number
  is_active: boolean
  manager?: { name: string } | null
  memberCount: number
  children: DepartmentNode[]
}

function buildTree(
  departments: any[],
  memberCounts: Record<string, number>
): DepartmentNode[] {
  const nodeMap = new Map<string, DepartmentNode>()

  // Create nodes
  for (const dept of departments) {
    nodeMap.set(dept.id, {
      ...dept,
      memberCount: memberCounts[dept.id] || 0,
      children: [],
    })
  }

  // Build tree
  const roots: DepartmentNode[] = []
  for (const dept of departments) {
    const node = nodeMap.get(dept.id)!
    if (dept.parent_department_id && nodeMap.has(dept.parent_department_id)) {
      nodeMap.get(dept.parent_department_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function DepartmentTreeNode({
  node,
  isLast,
  depth,
}: {
  node: DepartmentNode
  isLast: boolean
  depth: number
}) {
  return (
    <div className="relative">
      {/* Connector lines */}
      {depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0">
          {/* Vertical line from parent */}
          <div
            className={`absolute left-[-20px] top-0 border-l-2 border-muted-foreground/30 ${
              isLast ? 'h-[28px]' : 'h-full'
            }`}
          />
          {/* Horizontal line to this node */}
          <div className="absolute left-[-20px] top-[28px] w-[20px] border-b-2 border-muted-foreground/30" />
        </div>
      )}

      {/* Department card */}
      <Card
        className={`mb-3 ${
          !node.is_active ? 'opacity-50' : ''
        }`}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                node.is_active
                  ? 'bg-blue-50 dark:bg-blue-950/50'
                  : 'bg-muted'
              }`}
            >
              <Building2
                className={`h-5 w-5 ${
                  node.is_active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{node.name}</span>
                <Badge variant="outline" className="text-xs">
                  {node.code}
                </Badge>
                {!node.is_active && (
                  <Badge variant="secondary" className="text-xs">
                    無効
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>
                  部署長: {node.manager?.name || '未設定'}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {node.memberCount}名
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Children */}
      {node.children.length > 0 && (
        <div className="relative ml-[20px] pl-[20px]">
          {node.children.map((child, index) => (
            <DepartmentTreeNode
              key={child.id}
              node={child}
              isLast={index === node.children.length - 1}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default async function OrgChartPage() {
  const supabase = await createClient()

  const { data: departments } = await supabase
    .from('departments')
    .select('*, manager:users!fk_departments_manager(name)')
    .order('order_index')

  const { data: activeUsers } = await supabase
    .from('users')
    .select('department_id')
    .eq('is_active', true)

  // Count members per department
  const memberCounts: Record<string, number> = {}
  if (activeUsers) {
    for (const user of activeUsers) {
      if (user.department_id) {
        memberCounts[user.department_id] =
          (memberCounts[user.department_id] || 0) + 1
      }
    }
  }

  const tree = departments ? buildTree(departments, memberCounts) : []

  const totalDepartments = departments?.length || 0
  const activeDepartments =
    departments?.filter((d: any) => d.is_active).length || 0
  const totalMembers = activeUsers?.length || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">組織図</h1>
        <p className="text-muted-foreground">
          組織構造のビジュアル表示 - {activeDepartments}部署 / {totalMembers}名
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
              <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalDepartments}</p>
              <p className="text-xs text-muted-foreground">総部署数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/50">
              <GitBranch className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeDepartments}</p>
              <p className="text-xs text-muted-foreground">有効部署数</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/50">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalMembers}</p>
              <p className="text-xs text-muted-foreground">総メンバー数</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organization tree */}
      <Card>
        <CardContent className="p-6">
          {tree.length > 0 ? (
            <div>
              {tree.map((node, index) => (
                <DepartmentTreeNode
                  key={node.id}
                  node={node}
                  isLast={index === tree.length - 1}
                  depth={0}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16">
              <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">部署が登録されていません</p>
              <p className="text-sm text-muted-foreground">
                部署管理ページから部署を追加してください
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
