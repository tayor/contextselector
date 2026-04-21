import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/authSession';

export async function proxy(request: NextRequest) {
  // Get the pathname
  const path = request.nextUrl.pathname;

  // Check if the path is public
  const isPublicPath = path === '/login';

  // Check if the user is authenticated
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authenticatedUser = await verifyAuthToken(authCookie);

  // Redirect logic
  if (!isPublicPath && !authenticatedUser) {
    // Redirect to login if accessing protected route without auth
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isPublicPath && authenticatedUser) {
    // Redirect to home if accessing login page while authenticated
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

// Configure which routes the proxy applies to
export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
