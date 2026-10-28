import { NextResponse } from "next/server";
import { DEMO_COOKIE, createSupabaseServerClient, resolveApiUser } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/env";
import { handleRouteError } from "@/lib/api";


export async function POST(): Promise<NextResponse> {
  try {
    const user = await resolveApiUser();
    if (user?.mode === "supabase" && isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}
