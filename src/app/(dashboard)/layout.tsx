import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6 dark:bg-slate-900">
          {children}
        </main>
      </div>
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
    </div>
  )
}
