import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/env";
import { handleRouteError, jsonError } from "@/lib/api";

// Reads request.url (origin + query) at runtime; cannot be prerendered.
export const instant = false;

/**
 * OAuth / email-link callback: exchange ?code for a session, then redirect.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";
    if (!isSupabaseConfigured()) {
      return jsonError(503, "Supabase auth is not configured.", "not_configured");
    }
    if (code) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
      }
    }
    return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/dashboard"}`);
  } catch (err) {
    return handleRouteError(err);
  }
}
