'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Upload, Download, Trash2, Loader2, FolderOpen, FileIcon } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface FileRecord {
  id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  category: string | null
  description: string | null
  download_count: number
  uploaded_by: string
  organization_id: string
  created_at: string
  uploader?: { name: string }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function FilesPage() {
  const supabase = createClient()
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portal/files')
      const json = await res.json()
      if (res.ok && json.data) {
        setFiles(json.data)
      } else {
        toast.error(json.error || 'ファイルの取得に失敗しました')
      }
    } catch {
      toast.error('ファイルの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCurrentUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile) {
        setCurrentUserRole(profile.role)
      }
    }
  }, [supabase])

  useEffect(() => {
    fetchFiles()
    fetchCurrentUser()
  }, [fetchFiles, fetchCurrentUser])

  const handleDownload = (file: FileRecord) => {
    const { data } = supabase.storage.from('files').getPublicUrl(file.file_path)
    if (data?.publicUrl) {
      window.open(data.publicUrl, '_blank')
    } else {
      toast.error('ダウンロードURLの取得に失敗しました')
    }
  }

  const canDelete = (file: FileRecord): boolean => {
    return file.uploaded_by === currentUserId || currentUserRole === 'admin'
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/portal/files?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id))
        toast.success('ファイルを削除しました')
      } else {
        toast.error(json.error || '削除に失敗しました')
      }
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">ファイル管理</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">ファイル管理</h1>
        <Link href="/dashboard/portal/files/upload">
          <Button>
            <Upload className="mr-2 h-4 w-4" />アップロード
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        {files.map((f) => (
          <Card key={f.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileIcon className="h-8 w-8 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.uploader?.name} | {new Date(f.created_at).toLocaleDateString('ja-JP')} | {formatFileSize(f.file_size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {f.category && <Badge variant="outline">{f.category}</Badge>}
                <span className="text-xs text-muted-foreground">{f.download_count}DL</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(f)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {canDelete(f) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => setDeleteTarget(f)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {files.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="font-medium">ファイルはありません</p>
              <p className="text-sm text-muted-foreground mt-1">
                アップロードボタンからファイルを追加してください
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ファイルの削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.file_name}」を削除しますか？ストレージからも完全に削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
