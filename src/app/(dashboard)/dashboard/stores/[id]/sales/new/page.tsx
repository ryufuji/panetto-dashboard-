'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function NewSalePage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [salesDate, setSalesDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [salesType, setSalesType] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!salesType) {
      toast.error('売上種別を選択してください')
      return
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('金額を正しく入力してください')
      return
    }
    if (!paymentMethod) {
      toast.error('支払方法を選択してください')
      return
    }

    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { error } = await supabase.from('store_sales').insert({
        store_id: id,
        sales_date: salesDate,
        sales_type: salesType,
        amount: Number(amount),
        quantity: Number(quantity) || 1,
        payment_method: paymentMethod,
        registered_by: user?.id || null,
        notes: notes.trim() || null,
      })

      if (error) throw error

      toast.success('売上を登録しました')
      router.push(`/dashboard/stores/${id}/sales`)
    } catch (err: any) {
      toast.error(err.message || '登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/stores/${id}/sales`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">売上登録</h1>
          <p className="text-sm text-muted-foreground">
            売上情報を入力してください
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>売上情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="salesDate">売上日</Label>
                <Input
                  id="salesDate"
                  type="date"
                  value={salesDate}
                  onChange={(e) => setSalesDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  売上種別 <span className="text-red-500">*</span>
                </Label>
                <Select value={salesType} onValueChange={setSalesType}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drink">ドリンク</SelectItem>
                    <SelectItem value="food">フード</SelectItem>
                    <SelectItem value="bottle">ボトル</SelectItem>
                    <SelectItem value="other">その他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="amount">
                  金額（円） <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="10000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">数量</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  支払方法 <span className="text-red-500">*</span>
                </Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">現金</SelectItem>
                    <SelectItem value="card">カード</SelectItem>
                    <SelectItem value="electronic">電子マネー</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                placeholder="特記事項があれば入力..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Link href={`/dashboard/stores/${id}/sales`}>
            <Button variant="outline" type="button">
              キャンセル
            </Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            登録する
          </Button>
        </div>
      </form>
    </div>
  )
}
