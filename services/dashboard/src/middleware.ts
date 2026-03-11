import { NextRequest, NextResponse } from 'next/server'

// Minimal middleware — only block the dashboard route, leave all /api/ routes untouched
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Only protect the dashboard — check for token cookie
    if (pathname.startsWith('/dashboard')) {
        const token = request.cookies.get('token')?.value
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    // Only run on /dashboard routes — NOT on /api/ routes (avoids redirect loop on fetch calls)
    matcher: ['/dashboard/:path*'],
}
