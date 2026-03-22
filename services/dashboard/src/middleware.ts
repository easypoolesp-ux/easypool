import { NextRequest, NextResponse } from "next/server";

// Minimal middleware — only block the dashboard route, leave all /api/ routes untouched
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect the dashboard — check for token cookie
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get("__session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // Prevent Firebase Hosting CDN from caching dynamic pages
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export const config = {
  // Run on dashboard AND login routes — NOT on /api/ routes
  matcher: ["/dashboard/:path*", "/login"],
};
