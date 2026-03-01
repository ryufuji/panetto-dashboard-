'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Store, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface Office {
  id: string
  name: string
}

export default function NewStorePage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [offices, setOffices] = useState<Office[]>([])
  const [loadingOffices, setLoadingOffices] = useState(true)

  // Form fields
  const [storeCode, setStoreCode] = useState('')
  const [name, setName] = useState('')
  const [storeGroup, setStoreGroup] = useState('')
  const [area, setArea] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [openingTime, setOpeningTime] = useState('')
  const [closingTime, setClosingTime] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchOffices()
  }, [])

  const fetchOffices = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) return

      const { data, error } = await supabase
        .from('offices')
        .select('id, name')
        .eq('organization_id', profile.organization_id)
        .order('name')

      if (error) throw error
      setOffices(data || [])
    } catch (err: any) {
      console.error('事業所の取得に失敗:', err)
    } finally {
      setLoadingOffices(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!storeCode.trim()) {
      toast.error('店舗コードを入力してください')
      return
    }
    if (!name.trim()) {
      toast.error('店舗名を入力してください')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証エラー: ログインしてください')

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) throw new Error('ユーザー情報の取得に失敗しました')

      const { error } = await supabase.from('stores').insert({
        organization_id: profile.organization_id,
        store_code: storeCode.trim(),
        name: name.trim(),
        store_group: storeGroup.trim() || null,
        area: area.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        office_id: officeId || null,
        capacity: capacity ? parseInt(capacity) : null,
        opening_time: openingTime || null,
        closing_time: closingTime || null,
        notes: notes.trim() || null,
        status: 'active',
      })

      if (error) {
        if (error.code === '23505') {
          throw new Error('この店舗コードは既に使用されています')
        }
        throw error
      }

      toast.success('店舗を登録しました')
      router.push('/dashboard/stores')
    } catch (err: any) {
      toast.error(err.message || '店舗の登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/stores">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />戻る
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">店舗登録</h1>
          <p className="text-muted-foreground">新しい店舗を追加します</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />基本情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="storeCode">店舗コード <span className="text-red-500">*</span></Label>
                <Input
                  id="storeCode"
                  placeholder="例: ST001"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">店舗名 <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  placeholder="例: 渋谷店"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="storeGroup">店舗グループ</Label>
                <Input
                  id="storeGroup"
                  placeholder="例: 東京エリア"
                  value={storeGroup}
                  onChange={(e) => setStoreGroup(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">エリア</Label>
                <Input
                  id="area"
                  placeholder="例: 東京都渋谷区"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">住所</Label>
              <Input
                id="address"
                placeholder="例: 東京都渋谷区神南1-1-1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">電話番号</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="例: 03-1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="officeId">所属事業所</Label>
                <Select value={officeId} onValueChange={setOfficeId} disabled={loadingOffices}>
                  <SelectTrigger id="officeId">
                    <SelectValue placeholder={loadingOffices ? '読み込み中...' : '事業所を選択...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((office) => (
                      <SelectItem key={office.id} value={office.id}>
                        {office.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="capacity">席数</Label>
                <Input
                  id="capacity"
                  type="number"
                  min="0"
                  placeholder="例: 30"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openingTime">開店時間</Label>
                <Input
                  id="openingTime"
                  type="time"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closingTime">閉店時間</Label>
                <Input
                  id="closingTime"
                  type="time"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                placeholder="その他の情報（任意）"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Link href="/dashboard/stores">
            <Button type="button" variant="outline">キャンセル</Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />登録中...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" />店舗を登録</>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
