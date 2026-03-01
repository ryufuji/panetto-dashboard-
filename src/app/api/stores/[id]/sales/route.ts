import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    let query = supabase
      .from('store_sales')
      .select('*')
      .eq('store_id', id)
      .order('sales_date', { ascending: false })

    if (dateFrom) {
      query = query.gte('sales_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('sales_date', dateTo)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const summary = {
      total_sales: data.length,
      total_amount: data.reduce(
        (sum, sale) => sum + (sale.amount || 0),
        0
      ),
      average_amount:
        data.length > 0
          ? data.reduce((sum, sale) => sum + (sale.amount || 0), 0) /
            data.length
          : 0,
    }

    return NextResponse.json({ data, summary })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const { data, error } = await supabase
      .from('store_sales')
      .insert({
        ...body,
        store_id: id,
        registered_by: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
