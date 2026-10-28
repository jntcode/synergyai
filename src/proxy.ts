import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getServerEnv,
  isSupabaseConfigured,
  supabasePublishableKey,
} from "@/lib/env";
import { DEMO_COOKIE, isValidDemoCookie } from "@/lib/db";

const PROTECTED_PREFIXES = ["/dashboard"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/auth/");
}

/**
 * Next.js 16 proxy (formerly middleware): refreshes the Supabase session and
 * guards /dashboard routes. Works for both real auth and labeled demo mode.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = getServerEnv();

  let user: { id: string } | null = null;

  if (isSupabaseConfigured(env)) {
    let supabaseResponse = NextResponse.next({ request });
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL!,
      supabasePublishableKey()!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            supabaseResponse = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              supabaseResponse.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    const { data } = await supabase.auth.getClaims();
    user = data?.claims ? { id: String(data.claims.sub) } : null;

    if (isProtected(pathname) && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("next", pathname);
      const redirect = NextResponse.redirect(url);
      // Preserve refreshed cookies on the redirect.
      for (const c of supabaseResponse.cookies.getAll()) {
        redirect.cookies.set(c);
      }
      return redirect;
    }
    if (user && isAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (isProtected(pathname) || isAuthPage(pathname)) {
      return supabaseResponse;
    }
    return supabaseResponse;
  }

  // Demo-mode protection (no Supabase configured).
  const demoOk = isValidDemoCookie(request.cookies.get(DEMO_COOKIE)?.value);
  if (isProtected(pathname) && !demoOk) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
