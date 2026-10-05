import Script from 'next/script'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* ログインできない人もこの画面から報告できるよう、認証前の画面にもウィジェットを出す。
          ログイン前なので利用者を特定する情報は渡せない */}
      <Script
        src="https://visual-feedback-debugger-mvp-production.up.railway.app/widget.js"
        data-project-id="project-3bfb9bf7"
        data-api-base="https://visual-feedback-debugger-mvp-production.up.railway.app"
        data-button-label="フィードバック"
        data-position="bottom-right"
        data-primary-color="#147d64"
        data-danger-color="#d92d20"
        data-metadata={JSON.stringify({ service: 'panetto-dashboard', environment: 'production', screen: 'auth' })}
        strategy="afterInteractive"
      />
    </>
  )
}
