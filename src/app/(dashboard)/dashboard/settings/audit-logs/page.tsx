import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Shield } from 'lucide-react'

export default async function AuditLogsPage() {
  const supabase = await createClient()
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, user:users(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">監査ログ</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日時</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>アクション</TableHead>
                <TableHead>リソース</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{new Date(log.created_at).toLocaleString('ja-JP')}</TableCell>
                  <TableCell className="text-sm">{log.user?.name || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.resource}</TableCell>
                </TableRow>
              ))}
              {(!logs || logs.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  <Shield className="mx-auto h-8 w-8 mb-2 opacity-50" />ログなし
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
