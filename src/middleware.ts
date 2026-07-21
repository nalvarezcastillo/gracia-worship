import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (request.nextUrl.pathname.startsWith("/admin")) {
      console.error("[auth middleware] Supabase environment variables are missing.", {
        hasUrl: Boolean(url),
        hasAnonKey: Boolean(anonKey),
      });
    }
    return protectAdminRoute(request, response, false);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  if (error && request.nextUrl.pathname.startsWith("/admin")) {
    console.error("[auth middleware] Unable to validate the session.", {
      pathname: request.nextUrl.pathname,
      error,
    });
  }
  return protectAdminRoute(request, response, !error && Boolean(data?.claims?.sub));
}

function protectAdminRoute(request: NextRequest, response: NextResponse, isAuthenticated: boolean) {
  if (!request.nextUrl.pathname.startsWith("/admin") || isAuthenticated) return response;

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const redirectResponse = NextResponse.redirect(loginUrl);
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
