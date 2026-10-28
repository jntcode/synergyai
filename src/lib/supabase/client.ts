import { createBrowserClient } from "@supabase/ssr";
import { getServerEnv, isSupabaseConfigured, supabasePublishableKey } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getServerEnv();
  if (!isSupabaseConfigured(env)) return null;
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
  );
}
