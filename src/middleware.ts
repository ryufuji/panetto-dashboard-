import { NextResponse, type NextRequest } from 'next/server'

// Lightweight middleware: only checks for the presence of a Supabase auth cookie.
// Full JWT validation happens in Server Components via createClient().getUser(),
// which is the authoritative check. This keeps middleware off the DB on every
// navigation — critical at 300-user scale during the 18-20時 peak.
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Detect Supabase auth cookie. @supabase/ssr stores it as `sb-<ref>-auth-token`.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!hasAuthCookie && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (hasAuthCookie && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/forgot-password', '/reset-password'],
}
