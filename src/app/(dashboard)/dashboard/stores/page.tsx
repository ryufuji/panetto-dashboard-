import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Store, MapPin, Phone, Users, Plus } from 'lucide-react'
import Link from 'next/link'

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: '営業中', color: 'bg-green-50 text-green-700 border-green-200' },
  suspended: { label: '休止中', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  closed: { label: '閉店', color: 'bg-red-50 text-red-700 border-red-200' },
}

export default async function StoresPage() {
  const supabase = await createClient()

  const { data: stores } = await supabase
    .from('stores')
    .select('*, manager:users(name), office:offices(name)')
    .order('store_group')
    .order('name')

  // Group by store_group
  const groups: Record<string, any[]> = {}
  stores?.forEach((s: any) => {
    const g = s.store_group || 'その他'
    if (!groups[g]) groups[g] = []
    groups[g].push(s)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">店舗一覧</h1>
          <p className="text-muted-foreground">{stores?.length || 0}店舗</p>
        </div>
        <Link href="/dashboard/stores/new">
          <Button><Plus className="mr-1 h-4 w-4" />新規店舗</Button>
        </Link>
      </div>

      {Object.entries(groups).map(([group, groupStores]) => (
        <div key={group}>
          <h2 className="text-lg font-semibold mb-3">{group}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groupStores.map((store: any) => {
              const st = statusLabels[store.status] || statusLabels.active
              return (
                <Link key={store.id} href={`/dashboard/stores/${store.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                            <Store className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold">{store.name}</p>
                            <p className="text-xs text-muted-foreground">{store.store_code}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={st.color}>{st.label}</Badge>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {store.area && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{store.area}</p>}
                        {store.manager?.name && <p className="flex items-center gap-1"><Users className="h-3 w-3" />店長: {store.manager.name}</p>}
                        {store.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{store.phone}</p>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {(!stores || stores.length === 0) && (
        <Card><CardContent className="text-center py-12">
          <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="font-medium">店舗データがありません</p>
        </CardContent></Card>
      )}
    </div>
  )
}
