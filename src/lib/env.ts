import { z } from "zod";

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === "boolean") return v;
    if (v === undefined || v === "") return false;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  });

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_MODEL_FAST: z.string().optional(),
  AVATAR_PROVIDER: z.enum(["heygen", "demo"]).optional(),
  HEYGEN_API_KEY: z.string().optional(),
  HEYGEN_AVATAR_ID: z.string().optional(),
  LLM_SHARED_SECRET: z.string().optional(),
  DEMO_SESSION_SECRET: z.string().optional(),
  NEXT_PUBLIC_DEMO_MODE: boolish,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Lazily validate server environment variables. Never throws for missing optional
 * values — callers feature-detect through the helpers below so the app can render
 * honest "not configured" states instead of crashing at import time.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  cached = parsed.success
    ? parsed.data
    : // On parse failure, fall back to raw values so feature flags still work.
      (process.env as unknown as ServerEnv);
  return cached;
}

export function resetEnvCacheForTests(): void {
  cached = null;
}

export function isSupabaseConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function supabasePublishableKey(env: ServerEnv = getServerEnv()): string | undefined {
  return env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function isSupabaseSecretConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isOpenAIConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/**
 * LiveAvatar must be able to reach the custom LLM callback from its own
 * infrastructure. localhost/private hosts cannot work, and the callback must
 * be HTTPS. This is intentionally stricter than a generic URL check so live
 * mode fails with a useful setup error instead of a silent, non-talking avatar.
 */
export function isPublicHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (LOCAL_APP_HOSTS.has(host)) return false;
    if (host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) {
      return false;
    }
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Exact, non-secret list of what is missing for a real HeyGen LiveAvatar
 * session. `features.heygen` in the health response is derived from this.
 *
 * Typed live mode only needs the provider key and an avatar id: the browser
 * connects with the official SDK and asks the avatar to speak each server-
 * generated turn. A public HTTPS app URL and LLM callback are only needed for
 * the optional provider-driven voice mode, so they are not requirements here.
 */
export function heygenConfigIssues(env: ServerEnv = getServerEnv()): string[] {
  const issues: string[] = [];
  if (!env.HEYGEN_API_KEY) issues.push("HEYGEN_API_KEY");
  if (!env.HEYGEN_AVATAR_ID) issues.push("HEYGEN_AVATAR_ID");
  return issues;
}

export function isHeyGenConfigured(env: ServerEnv = getServerEnv()): boolean {
  return heygenConfigIssues(env).length === 0;
}

export function openAIModel(env: ServerEnv = getServerEnv()): string {
  return env.OPENAI_MODEL || "gpt-6.1-sol";
}

export function openAIFastModel(env: ServerEnv = getServerEnv()): string {
  return env.OPENAI_MODEL_FAST || "gpt-6-luna";
}

export function appUrl(env: ServerEnv = getServerEnv()): string {
  return env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function forceDemoMode(env: ServerEnv = getServerEnv()): boolean {
  return env.NEXT_PUBLIC_DEMO_MODE === true;
}

/**
 * Whether the signed demo cookie may grant demo access. When real Supabase
 * auth is configured, the demo account must never shadow it — demo access is
 * only allowed when Supabase is absent or demo mode is explicitly forced.
 */
export function isDemoAuthAllowed(env: ServerEnv = getServerEnv()): boolean {
  return forceDemoMode(env) || !isSupabaseConfigured(env);
}

/**
 * Which avatar provider the app should use right now.
 *
 * - Unset + fully configured → heygen.
 * - Unset + incomplete config → demo (the honest, labeled fallback).
 * - Explicit `AVATAR_PROVIDER=heygen` → heygen even when configuration is
 *   incomplete, so the start request returns a precise configuration error
 *   instead of silently pretending the live avatar was used.
 */
export function activeAvatarProvider(env: ServerEnv = getServerEnv()): "heygen" | "demo" {
  if (forceDemoMode(env)) return "demo";
  if (env.AVATAR_PROVIDER === "demo") return "demo";
  if (env.AVATAR_PROVIDER === "heygen") return "heygen";
  return isHeyGenConfigured(env) ? "heygen" : "demo";
}

export function llmSharedSecret(env: ServerEnv = getServerEnv()): string | undefined {
  return env.LLM_SHARED_SECRET;
}

export function demoSessionSecret(env: ServerEnv = getServerEnv()): string {
  return env.DEMO_SESSION_SECRET || "dev-only-change-me";
}
