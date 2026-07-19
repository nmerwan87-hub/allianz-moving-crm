import { type NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? ""
  const { pathname } = request.nextUrl

  const adminHost = process.env["NEXT_PUBLIC_ADMIN_URL"]
    ? new URL(process.env["NEXT_PUBLIC_ADMIN_URL"]).host
    : "admin.bivro.io"

  if (pathname.startsWith("/admin") && host !== adminHost) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
