import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db";
import { appUrl, isSupabaseConfigured } from "@/lib/env";
import { handleRouteError, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";


const bodySchema = z.object({ email: z.string().email() });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError(503, "Password reset is not configured.", "not_configured");
    }
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`auth-reset:${ip}`, { windowSeconds: 300, max: 5 });
    if (!rl.ok) return jsonError(429, "Too many reset attempts.", "rate_limited");

    const { email } = bodySchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl()}/auth/callback?next=/dashboard/settings`,
    });
    // Always report success to avoid account enumeration.
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
