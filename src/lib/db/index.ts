import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DemoRepo } from "@/lib/db/demo-repo";
import { SupabaseRepo } from "@/lib/db/supabase-repo";
import type { DataRepo } from "@/lib/db/demo-repo";
import {
  appUrl,
  demoSessionSecret,
  getServerEnv,
  isDemoAuthAllowed,
  isSupabaseConfigured,
  supabasePublishableKey,
} from "@/lib/env";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_COOKIE = "synergy_demo_session";
export const GUEST_COOKIE = "synergy_guest_session";

export type AuthMode = "supabase" | "demo" | "guest" | "anonymous";

export interface ApiUser {
  userId: string;
  mode: AuthMode;
  email: string | null;
}

export function demoCookieValue(): string {
  return createHmac("sha256", demoSessionSecret()).update(DEMO_USER_ID).digest("hex");
}

export function isValidDemoCookie(value: string | undefined): boolean {
  if (!value) return false;
  const expected = demoCookieValue();
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

function guestSignature(userId: string): string {
  return createHmac("sha256", demoSessionSecret())
    .update(`guest:${userId}`)
    .digest("hex");
}

/**
 * Create an anonymous, signed guest identity. The cookie only carries a random
 * guest id and an HMAC signature — never interview content or personal data.
 */
export function createGuestSession(): { userId: string; value: string } {
  const userId = randomUUID();
  return { userId, value: `${userId}.${guestSignature(userId)}` };
}

export function parseGuestCookie(value: string | undefined): string | null {
  if (!value) return null;
  const [userId, signature, extra] = value.split(".");
  if (!userId || !signature || extra) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return null;
  }
  const expected = guestSignature(userId);
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return userId;
}

export function guestCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

/**
 * Resolve the calling user from the request.
 * Priority: Supabase session (real auth) → signed demo cookie (labeled demo mode)
 * → signed anonymous guest cookie (no account required).
 */
export async function resolveApiUser(): Promise<ApiUser | null> {
  const env = getServerEnv();
  if (isSupabaseConfigured(env)) {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getClaims();
    if (error) {
      // Fall through to demo cookie check only when there is no session at all.
      console.warn(`auth.getClaims failed: ${error.message}`);
    } else if (data?.claims?.sub) {
      return {
        userId: data.claims.sub as string,
        mode: "supabase",
        email: (data.claims.email as string | undefined) ?? null,
      };
    }
  }
  const cookieStore = await cookies();
  // The demo cookie only grants access when real Supabase auth is absent (or
  // demo mode is explicitly forced) — it must never shadow configured auth.
  if (isDemoAuthAllowed(env) && isValidDemoCookie(cookieStore.get(DEMO_COOKIE)?.value)) {
    return { userId: DEMO_USER_ID, mode: "demo", email: "demo@synergyai.local" };
  }
  const guestId = parseGuestCookie(cookieStore.get(GUEST_COOKIE)?.value);
  if (guestId) {
    return { userId: guestId, mode: "guest", email: null };
  }
  return null;
}

export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / publishable key).");
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware refreshes cookies instead.
        }
      },
    },
  });
}

/**
 * Repository for the current request. Demo mode uses the in-memory store;
 * Supabase mode enforces RLS with the caller's session.
 */
export async function getUserRepo(user: ApiUser): Promise<DataRepo> {
  if (user.mode === "demo" || user.mode === "guest") return new DemoRepo();
  const client = await createSupabaseServerClient();
  return SupabaseRepo.forUser(client);
}
