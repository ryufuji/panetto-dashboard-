import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; handoverId: string }> }
) {
  try {
    const { id, handoverId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const updateData: Record<string, any> = {}

    if (body.is_resolved !== undefined) {
      updateData.is_resolved = body.is_resolved
    }

    if (body.is_resolved === true) {
      updateData.resolved_by = body.resolved_by || user.id
      updateData.resolved_at = body.resolved_at || new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('handovers')
      .update(updateData)
      .eq('id', handoverId)
      .eq('store_id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Handover not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; handoverId: string }> }
) {
  try {
    const { id, handoverId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('handovers')
      .delete()
      .eq('id', handoverId)
      .eq('store_id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Handover deleted successfully' })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
