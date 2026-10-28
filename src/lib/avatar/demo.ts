import "server-only";
import { randomUUID } from "node:crypto";
import type {
  AvatarProvider,
  AvatarSessionStartResult,
} from "@/lib/avatar/types";

/**
 * Demo avatar provider — NO live video. Renders a labeled placeholder in the
 * interview room; questions are delivered as text with optional browser
 * speechSynthesis. Always surfaced as "Demo interviewer" in the UI.
 */
export class DemoAvatarProvider implements AvatarProvider {
  readonly id = "demo" as const;

  isConfigured(): boolean {
    return true;
  }

  async createSession(): Promise<AvatarSessionStartResult> {
    return {
      provider: "demo",
      providerSessionRef: `demo-${randomUUID()}`,
      note:
        "Demo interviewer: no live avatar video. Answers are typed; speech is browser-generated and clearly labeled.",
    };
  }

  async stopSession(): Promise<void> {
    // Nothing to clean up server-side.
  }

  async getSessionStatus(): Promise<"active" | "ended" | "unknown"> {
    return "unknown";
  }
}
