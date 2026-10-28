import "server-only";
import { activeAvatarProvider, getServerEnv } from "@/lib/env";
import { HeyGenProvider } from "@/lib/avatar/heygen";
import { DemoAvatarProvider } from "@/lib/avatar/demo";
import type { AvatarProvider } from "@/lib/avatar/types";

export function getAvatarProvider(): AvatarProvider {
  const env = getServerEnv();
  if (activeAvatarProvider(env) === "heygen") return new HeyGenProvider();
  return new DemoAvatarProvider();
}

export type { AvatarProvider, AvatarSessionStartResult, CreateAvatarSessionInput } from "@/lib/avatar/types";
export { llmBearerForSession, AvatarConfigurationError } from "@/lib/avatar/heygen";
