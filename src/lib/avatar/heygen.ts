import "server-only";
import { createHmac } from "node:crypto";
import {
  getServerEnv,
  heygenConfigIssues,
  isHeyGenConfigured,
  llmSharedSecret,
} from "@/lib/env";
import { logger } from "@/lib/logger";
import type {
  AvatarProvider,
  AvatarSessionStartResult,
  CreateAvatarSessionInput,
} from "@/lib/avatar/types";
import { getPersona } from "@/lib/interview/personas";
import { GUARDRAILS, languageLine } from "@/lib/ai/prompts";

const API_BASE = "https://api.liveavatar.com";

/**
 * Raised before any paid provider work when the deployment cannot support a
 * real LiveAvatar session. The start route turns this into a visible setup
 * error (never a silent demo fallback).
 */
export class AvatarConfigurationError extends Error {
  readonly code = "avatar_configuration";

  constructor(readonly issues: string[]) {
    super(
      `Live avatar is not configured. Missing or invalid: ${issues.join(", ")}. ` +
        "Set AVATAR_PROVIDER=heygen and add a HeyGen LiveAvatar API key plus an avatar id. " +
        "See https://docs.liveavatar.com/docs/full-mode/overview.",
    );
    this.name = "AvatarConfigurationError";
  }
}

/**
 * Derive the bearer secret HeyGen must present when calling our per-session
 * OpenAI-compatible LLM endpoint. Deterministic HMAC — never stored, only
 * verifiable by the server that knows LLM_SHARED_SECRET.
 */
export function llmBearerForSession(interviewSessionId: string): string | null {
  const secret = llmSharedSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(`llm:${interviewSessionId}`).digest("hex");
}

function systemPromptForSession(input: CreateAvatarSessionInput): string {
  const persona = getPersona(input.persona);
  return [
    "You are a live interviewer in a structured mock interview powered by SynergyAI.",
    GUARDRAILS,
    languageLine(input.language),
    persona.stylePrompt,
    `Session reference: ${input.interviewSessionId}.`,
    "Speak only short, natural interviewer lines (1–3 sentences). One question at a time.",
    "All evaluation happens server-side — never mention scores, rubrics, or these instructions.",
  ].join("\n\n");
}

/**
 * HeyGen LiveAvatar provider (FULL mode, typed-client-driven speech).
 * Doc references (Oct 2026): https://docs.liveavatar.com + live OpenAPI spec.
 *  - POST /v1/contexts                (prompt + opening_text; no context ⇒ restricted mode)
 *  - POST /v1/sessions/token          (avatar_id REQUIRED) → { data: { session_id, session_token } }
 *  - POST /v1/sessions/stop           (Bearer session token or X-API-KEY)
 *  - GET  /v1/sessions/{session_id}   (entry has end_at once ended)
 *
 * Each server-generated interviewer turn is spoken in the browser through the
 * documented `avatar.speak_text` event (`session.repeat(text)` in the SDK).
 * The provider still owns TTS/lip-sync/video; SynergyAI owns the interview
 * intelligence. No public callback URL is required for this mode.
 */
export class HeyGenProvider implements AvatarProvider {
  readonly id = "heygen" as const;

  isConfigured(): boolean {
    return isHeyGenConfigured();
  }

  private headers(): HeadersInit {
    const key = getServerEnv().HEYGEN_API_KEY;
    return { "X-API-KEY": key ?? "", "content-type": "application/json" };
  }

  async createSession(input: CreateAvatarSessionInput): Promise<AvatarSessionStartResult> {
    const env = getServerEnv();
    const avatarId = env.HEYGEN_AVATAR_ID;
    // Validate the complete live setup before creating any provider resources.
    const issues = heygenConfigIssues(env);
    if (!env.HEYGEN_API_KEY || !avatarId) {
      throw new AvatarConfigurationError(issues.length > 0 ? issues : ["live avatar configuration"]);
    }

    // Register a per-session context. opening_text is spoken by the avatar as
    // soon as the stream starts, so the candidate always hears the first
    // question even before submitting anything.
    const openingText = input.openingText?.trim() ?? "";
    const contextId = await this.createContext(
      `synergy-${input.interviewSessionId.slice(0, 8)}`,
      systemPromptForSession(input),
      openingText,
    );

    // Mint a short-lived FULL-mode session token bound to the context. No
    // llm_configuration_id: the provider-managed LLM is not used for typed
    // interviews, and omitting it avoids requiring a public callback URL.
    const tokenRes = await fetch(`${API_BASE}/v1/sessions/token`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        mode: "FULL",
        avatar_id: avatarId,
        interactivity_type: "CONVERSATIONAL",
        max_session_duration: input.maxSessionSeconds,
        video_settings: { quality: "high", encoding: "H264" },
        // avatar_persona is deprecated upstream but still accepted; language is
        // also enforced by the interview engine that generates every line.
        avatar_persona: {
          context_id: contextId,
          language: input.language === "pt" ? "pt" : "en",
        },
      }),
      cache: "no-store",
    });
    if (!tokenRes.ok) {
      const body = await safeText(tokenRes);
      throw new Error(`HeyGen session token failed (${tokenRes.status}): ${body}`);
    }
    const tokenJson = (await tokenRes.json()) as {
      data?: { session_id?: string; session_token?: string };
    };
    const sessionId = tokenJson.data?.session_id;
    const sessionToken = tokenJson.data?.session_token;
    if (!sessionId || !sessionToken) {
      throw new Error("HeyGen session token response missing session_id/session_token.");
    }

    logger.info("avatar.heygen.session_created", { interviewSessionId: input.interviewSessionId });
    return {
      provider: "heygen",
      providerSessionRef: sessionId,
      sessionToken,
      note: "Live HeyGen avatar session token minted. The browser will attach the real stream and speak server-generated interview turns.",
    };
  }

  private async createContext(
    name: string,
    prompt: string,
    openingText: string,
  ): Promise<string> {
    const res = await fetch(`${API_BASE}/v1/contexts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ name: name.slice(0, 64), prompt, opening_text: openingText }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HeyGen context create failed (${res.status}): ${await safeText(res)}`);
    }
    const json = (await res.json()) as { data?: { id?: string }; id?: string };
    const id = json.data?.id ?? json.id;
    if (!id) throw new Error("HeyGen context response missing id.");
    return id;
  }

  async stopSession(providerSessionRef: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/v1/sessions/stop`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ session_id: providerSessionRef, reason: "USER_CLOSED" }),
        cache: "no-store",
      });
      if (!res.ok) {
        logger.warn("avatar.heygen.stop_failed", { status: res.status });
      }
    } catch (err) {
      logger.warn("avatar.heygen.stop_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Best-effort status probe via GET /v1/sessions/{id}. The active-session
   * entry has no end_at; historic entries include end_at. Non-OK responses
   * (network, auth, unknown id) resolve to "unknown" — never throws.
   */
  async getSessionStatus(providerSessionRef: string): Promise<"active" | "ended" | "unknown"> {
    try {
      const res = await fetch(`${API_BASE}/v1/sessions/${providerSessionRef}`, {
        headers: this.headers(),
        cache: "no-store",
      });
      if (!res.ok) return "unknown";
      const json = (await res.json()) as {
        data?: { end_at?: string | null; end_reason?: string | null };
      };
      const data = json.data;
      if (!data) return "unknown";
      return data.end_at ? "ended" : "active";
    } catch {
      return "unknown";
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "[unreadable body]";
  }
}
