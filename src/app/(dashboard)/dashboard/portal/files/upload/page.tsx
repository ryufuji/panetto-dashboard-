'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Upload, FileUp, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function FileUploadPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('document')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    const maxSize = 50 * 1024 * 1024 // 50MB
    if (selected.size > maxSize) {
      toast.error('ファイルサイズは50MB以下にしてください')
      e.target.value = ''
      return
    }

    setFile(selected)
    if (!displayName) {
      setDisplayName(selected.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      toast.error('ファイルを選択してください')
      return
    }

    setLoading(true)
    setProgress(0)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー: ログインしてください')

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) throw new Error('ユーザー情報の取得に失敗しました')

      setProgress(10)

      // Generate unique file path
      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || ''
      const filePath = `${profile.organization_id}/${timestamp}_${file.name}`

      setProgress(20)

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      setProgress(70)

      // Create record in files table
      const { error: dbError } = await supabase.from('files').insert({
        organization_id: profile.organization_id,
        file_name: displayName.trim() || file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        uploaded_by: user.id,
        category,
        description: description.trim() || null,
      })

      if (dbError) {
        // Clean up uploaded file if DB insert fails
        await supabase.storage.from('files').remove([filePath])
        throw dbError
      }

      setProgress(100)
      toast.success('ファイルをアップロードしました')
      router.push('/dashboard/portal/files')
    } catch (err: any) {
      toast.error(err.message || 'アップロードに失敗しました')
      setProgress(0)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/portal/files">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ファイルアップロード</h1>
          <p className="text-muted-foreground">ファイルを共有フォルダにアップロードします</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            {/* File selection area */}
            <div className="space-y-2">
              <Label>ファイル <span className="text-red-500">*</span></Label>
              {!file ? (
                <div
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">クリックしてファイルを選択</p>
                  <p className="text-xs text-muted-foreground mt-1">最大50MBまで</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border p-4">
                  <FileUp className="h-8 w-8 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} | {file.type || '不明な形式'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                placeholder="ファイルの表示名（空欄の場合はファイル名を使用）"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                placeholder="ファイルの説明（任意）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">カテゴリ</Label>
              <Select value={category} onValueChange={setCategory} disabled={loading}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="カテゴリを選択..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">文書</SelectItem>
                  <SelectItem value="spreadsheet">スプレッドシート</SelectItem>
                  <SelectItem value="image">画像</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Upload progress */}
            {loading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">アップロード中...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/dashboard/portal/files">
                <Button type="button" variant="outline" disabled={loading}>キャンセル</Button>
              </Link>
              <Button type="submit" disabled={loading || !file}>
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />アップロード中...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" />アップロード</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
