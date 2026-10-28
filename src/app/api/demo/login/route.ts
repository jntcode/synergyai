import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_USER_ID, demoCookieValue, resolveApiUser } from "@/lib/db";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { jsonError } from "@/lib/api";
import { isDemoAuthAllowed } from "@/lib/env";


/**
 * Enter labeled demo mode (only meaningful when Supabase is not configured).
 * Sets an HMAC-signed cookie; no password, no real account.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Never issue demo credentials when real Supabase auth is configured —
  // demo access must not shadow or bypass real authentication.
  if (!isDemoAuthAllowed()) {
    return jsonError(
      409,
      "Real accounts are configured on this deployment. Sign in with your email instead.",
      "demo_disabled",
    );
  }
  const existing = await resolveApiUser();
  if (existing) {
    return NextResponse.json({ ok: true, mode: existing.mode, userId: existing.userId });
  }
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const rl = checkRateLimit(`demo-login:${ip}`, RATE_LIMITS.demoLogin);
  if (!rl.ok) {
    return jsonError(429, "Too many attempts. Try again shortly.", "rate_limited", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }
  const res = NextResponse.json({ ok: true, mode: "demo", userId: DEMO_USER_ID });
  // Secure only when the request actually arrived over HTTPS. NODE_ENV alone is
  // wrong: `next start` locally (or any HTTP deployment) would set a Secure
  // cookie the client refuses to send back.
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol;
  res.cookies.set(DEMO_COOKIE, demoCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: proto === "https:" || proto === "https",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
