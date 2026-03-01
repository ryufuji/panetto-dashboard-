import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Edit } from 'lucide-react'
import Link from 'next/link'

export default async function DraftsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: drafts } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', user?.id || '')
    .eq('status', 'draft')
    .order('report_date', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">下書き一覧</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>タイトル</TableHead>
                <TableHead>更新日時</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts && drafts.length > 0 ? drafts.map((d: any) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-gray-50">
                  <TableCell><Link href={`/dashboard/reports/${d.id}`} className="block font-medium">{d.report_date}</Link></TableCell>
                  <TableCell><Link href={`/dashboard/reports/${d.id}`} className="block">{d.title || '-'}</Link></TableCell>
                  <TableCell><Link href={`/dashboard/reports/${d.id}`} className="block text-sm text-muted-foreground">{new Date(d.updated_at).toLocaleString('ja-JP')}</Link></TableCell>
                  <TableCell><Link href={`/dashboard/reports/${d.id}`}><Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button></Link></TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />下書きはありません
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
