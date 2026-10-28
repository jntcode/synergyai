import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/env";
import { handleRouteError, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";


const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!isSupabaseConfigured()) {
      return jsonError(
        503,
        "Email sign-in is not configured. Use demo mode until Supabase is connected.",
        "not_configured",
      );
    }
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`auth-login:${ip}`, { windowSeconds: 60, max: 10 });
    if (!rl.ok) return jsonError(429, "Too many sign-in attempts.", "rate_limited");

    const { email, password } = bodySchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return jsonError(401, "Invalid email or password.", "invalid_credentials");
    }
    return NextResponse.json({ ok: true, userId: data.user?.id });
  } catch (err) {
    return handleRouteError(err);
  }
}
