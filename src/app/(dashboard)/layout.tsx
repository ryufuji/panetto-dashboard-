import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/DashboardShell'
import Script from 'next/script'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const { data: user } = await supabase
    .from('users')
    .select('*, department:departments!users_department_id_fkey(*), office:offices!users_office_id_fkey(*)')
    .eq('id', authUser.id)
    .single()

  return (
    <>
      <DashboardShell user={user}>{children}</DashboardShell>
      <Script
        src="https://visual-feedback-debugger-mvp-production.up.railway.app/widget.js"
        data-project-id="project-3bfb9bf7"
        data-api-base="https://visual-feedback-debugger-mvp-production.up.railway.app"
        data-button-label="フィードバック"
        data-position="bottom-right"
        data-primary-color="#147d64"
        data-danger-color="#d92d20"
        data-user-id={authUser.id}
        data-user-name={user?.name ?? ''}
        data-user-email={authUser.email ?? ''}
        data-metadata={JSON.stringify({ service: 'panetto-dashboard', environment: 'production' })}
        strategy="afterInteractive"
      />
    </>
  )
}
