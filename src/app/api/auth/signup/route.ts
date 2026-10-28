import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db";
import { appUrl, isSupabaseConfigured } from "@/lib/env";
import { handleRouteError, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";


const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError(
        503,
        "Sign-up is not configured. Use demo mode until Supabase is connected.",
        "not_configured",
      );
    }
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`auth-signup:${ip}`, { windowSeconds: 300, max: 5 });
    if (!rl.ok) return jsonError(429, "Too many sign-up attempts.", "rate_limited");

    const body = bodySchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
        data: { display_name: body.displayName ?? null },
      },
    });
    if (error) {
      return jsonError(400, friendlySignupError(error), "signup_failed");
    }
    // Best-effort profile row (RLS allows insert of own id).
    if (data.user) {
      try {
        await supabase
          .from("profiles")
          .upsert({ id: data.user.id, display_name: body.displayName ?? null });
      } catch {
        // Non-fatal: profile will be created lazily on first read.
      }
    }
    return NextResponse.json({
      ok: true,
      needsEmailConfirmation: Boolean(data.user && !data.session),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Map Supabase Auth errors to actionable, non-internal messages. Anything
 * unrecognized becomes a generic failure so internals never reach the client.
 */
function friendlySignupError(error: { code?: string; message?: string }): string {
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  if (code === "user_already_exists" || message.includes("already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return "Please choose a stronger password (at least 8 characters).";
  }
  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "Too many sign-up attempts for this email. Wait a few minutes and try again.";
  }
  if (code === "validation_failed" || message.includes("valid email")) {
    return "Please enter a valid email address.";
  }
  return "Sign-up failed. Please try again — if it keeps failing, check the Supabase configuration.";
}
