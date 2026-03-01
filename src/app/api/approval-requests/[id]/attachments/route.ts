import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('approval_request_attachments')
      .select('*, uploader:users!approval_request_attachments_uploaded_by_fkey(id, name)')
      .eq('request_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify request exists
    const { data: approvalReq, error: fetchError } = await supabase
      .from('approval_requests')
      .select('id, organization_id, status')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const body = await request.json()
    const { file_name, file_path, file_size, content_type } = body

    if (!file_name || !file_path) {
      return NextResponse.json({ error: 'ファイル名とパスは必須です' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('approval_request_attachments')
      .insert({
        request_id: id,
        file_name,
        file_path,
        file_size: file_size || 0,
        content_type: content_type || 'application/octet-stream',
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const attachmentId = searchParams.get('attachmentId')

    if (!attachmentId) {
      return NextResponse.json({ error: 'attachmentId is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: attachment, error: fetchError } = await supabase
      .from('approval_request_attachments')
      .select('file_path, uploaded_by')
      .eq('id', attachmentId)
      .eq('request_id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: '添付ファイルが見つかりません' }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (attachment.uploaded_by !== user.id) {
      return NextResponse.json({ error: '自分がアップロードしたファイルのみ削除できます' }, { status: 403 })
    }

    // Delete from storage
    await supabase.storage.from('approval-files').remove([attachment.file_path])

    // Delete record
    const { error } = await supabase
      .from('approval_request_attachments')
      .delete()
      .eq('id', attachmentId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
