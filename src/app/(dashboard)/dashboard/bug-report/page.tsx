'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Bug, Send } from 'lucide-react'
import { toast } from 'sonner'

export default function BugReportPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('タイトルを入力してください')
      return
    }
    setSubmitting(true)
    try {
      // バグ報告の保存・通知エンドポイントが未実装の間はトースト表示のみ
      // TODO: /api/bug-reports POST を実装したら fetch に置き換え
      await new Promise(r => setTimeout(r, 400))
      toast.success('バグ報告を送信しました。ご協力ありがとうございます。')
      setTitle('')
      setDescription('')
      setSteps('')
    } catch (err: any) {
      toast.error(err.message || '送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bug className="h-7 w-7 text-orange-500" />バグ報告
        </h1>
        <p className="text-muted-foreground">不具合や改善要望をお知らせください</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">報告フォーム</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>タイトル <span className="text-red-500">*</span></Label>
            <Input
              placeholder="例: 日報作成画面で送信ボタンが反応しない"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>詳細</Label>
            <Textarea
              placeholder="何が起きたか、何を期待していたか"
              rows={5}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>再現手順 (任意)</Label>
            <Textarea
              placeholder="1. ○○ボタンを押す&#10;2. △△を入力する&#10;3. ..."
              rows={4}
              value={steps}
              onChange={e => setSteps(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting} className="bg-orange-600 hover:bg-orange-700">
              <Send className="mr-2 h-4 w-4" />{submitting ? '送信中...' : '送信する'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
