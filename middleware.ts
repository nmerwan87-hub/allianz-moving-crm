import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

const AUTH_ROUTES = new Set([
  "/login",
  "/register",
  "/register/check-email",
  "/register/verify-expired",
  "/forgot-password",
  "/reset-password",
  "/pending-approval",
  "/suspended",
  "/rejected",
  "/archived",
])

const PUBLIC_PREFIXES = ["/auth/", "/invite/", "/api/", "/_next/", "/onboarding/"]

const STATUS_REDIRECT: Record<string, string> = {
  pending_email_verification: "/register/check-email",
  pending_review: "/pending-approval",
  suspended: "/suspended",
  rejected: "/rejected",
  archived: "/archived",
}

function isPublicPath(pathname: string): boolean {
  if (AUTH_ROUTES.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get("host") ?? ""

  // Block /admin routes on non-admin hosts
  const adminHost = process.env["NEXT_PUBLIC_ADMIN_URL"]
    ? new URL(process.env["NEXT_PUBLIC_ADMIN_URL"]).host
    : "admin.bivro.io"

  if (pathname.startsWith("/admin") && host !== adminHost) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  // Build a response to mutate cookies on (session refresh)
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            if (options !== undefined) {
              response.cookies.set(name, value, options)
            } else {
              response.cookies.set(name, value)
            }
          })
        },
      },
    },
  )

  // Use getUser() not getSession() — middleware must not trust cached session data
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublic = isPublicPath(pathname)

  // Unauthenticated: protect non-public paths
  if (!user) {
    if (!isPublic) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = "/login"
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  // Authenticated user
  const companyStatus = user.app_metadata["company_status"] as string | undefined

  // Non-active company: gate to their status page
  if (companyStatus !== undefined && companyStatus !== "active") {
    const targetPath = STATUS_REDIRECT[companyStatus]
    if (targetPath !== undefined && pathname !== targetPath) {
      const isSystemPath =
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/_next/")
      if (!isSystemPath) {
        return NextResponse.redirect(new URL(targetPath, request.url))
      }
    }
    return response
  }

  // Active user trying to access login/register pages → dashboard
  if (companyStatus === "active" && AUTH_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
