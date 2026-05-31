import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  // Skip auth check in browser-only mode
  if (process.env.NEXT_PUBLIC_DATA_BACKEND === "browser") {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()

  // Public routes that don't need auth
  const publicPaths = ["/login", "/api/cron"]
  if (publicPaths.some((p) => url.pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Skip static/api routes that handle their own auth
  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/icons") || url.pathname === "/manifest.json" || url.pathname === "/sw.js") {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !url.pathname.startsWith("/api")) {
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js).*)"],
}

