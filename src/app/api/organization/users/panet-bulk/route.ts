import { createClient } from '@/lib/supabase/server'
import { createPanetUsersBulk } from '@/lib/panet'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (currentUser?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    // Fetch all active users with their department names
    const { data: users, error } = await supabase
      .from('users')
      .select('email, name, hire_date, department:departments!users_department_id_fkey(name)')
      .eq('is_active', true)
      .order('name')

    if (error || !users) {
      return NextResponse.json({ error: error?.message || 'Failed to fetch users' }, { status: 500 })
    }

    const panetUsers = users.map((u: any) => {
      let joinYear: number | undefined
      if (u.hire_date) {
        const hd = new Date(u.hire_date)
        if (!isNaN(hd.getTime())) {
          const month = hd.getMonth() + 1
          const year = hd.getFullYear()
          joinYear = month >= 4 ? year : year - 1
        }
      }
      return {
        email: u.email,
        display_name: u.name,
        department: u.department?.name || undefined,
        join_year: joinYear,
      }
    })

    const result = await createPanetUsersBulk(panetUsers)

    if (!result) {
      return NextResponse.json({ error: 'PANET API接続に失敗しました' }, { status: 502 })
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
