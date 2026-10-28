import { NextResponse } from "next/server";
import { connection } from "next/server";
import {
  activeAvatarProvider,
  getServerEnv,
  heygenConfigIssues,
  isHeyGenConfigured,
  isOpenAIConfigured,
  isSupabaseConfigured,
  isSupabaseSecretConfigured,
} from "@/lib/env";

/** Public health/config probe (no secrets). Used by the UI to render honest states. */
export async function GET(): Promise<NextResponse> {
  // Feature flags must reflect the runtime environment, not build-time values.
  await connection();
  const env = getServerEnv();
  return NextResponse.json({
    ok: true,
    app: "synergyai",
    features: {
      supabase: isSupabaseConfigured(env),
      supabaseSecret: isSupabaseSecretConfigured(env),
      openai: isOpenAIConfigured(env),
      heygen: isHeyGenConfigured(env),
      /** Non-secret list of missing/invalid values for a real LiveAvatar session. */
      heygenIssues: heygenConfigIssues(env),
      /** True when the deployment explicitly asked for live video (even if misconfigured). */
      heygenRequested: env.AVATAR_PROVIDER === "heygen",
      avatarProvider: activeAvatarProvider(env),
      /** Configured auth mode — presence of configuration, not a verified connection. */
      auth: isSupabaseConfigured(env) ? "supabase" : "demo",
      demoMode:
        env.NEXT_PUBLIC_DEMO_MODE === true ||
        !isSupabaseConfigured(env) ||
        !isOpenAIConfigured(env),
    },
  });
}
