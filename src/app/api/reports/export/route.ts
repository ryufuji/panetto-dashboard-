import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const departmentId = searchParams.get('department_id')

    let query = supabase
      .from('reports')
      .select('*, user:users(name, email), department:departments(name)')
      .order('report_date', { ascending: false })

    if (dateFrom) {
      query = query.gte('report_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('report_date', dateTo)
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const headers = [
      'ID',
      'Report Date',
      'Title',
      'Status',
      'User Name',
      'User Email',
      'Department',
      'Created At',
    ]

    const escapeCSV = (value: string | null | undefined): string => {
      if (value === null || value === undefined) return ''
      const str = String(value)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = (data || []).map((report) => [
      escapeCSV(report.id),
      escapeCSV(report.report_date),
      escapeCSV(report.title),
      escapeCSV(report.status),
      escapeCSV(report.user?.name),
      escapeCSV(report.user?.email),
      escapeCSV(report.department?.name),
      escapeCSV(report.created_at),
    ])

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join(
      '\n'
    )

    const bom = '\uFEFF'

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reports_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
