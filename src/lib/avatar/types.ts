import type { InterviewLanguage } from "@/lib/ai/schemas";
import type { InterviewerPersonaId } from "@/lib/ai/schemas";

/**
 * Provider-agnostic avatar session contract. Implementations:
 *  - heygen.ts  → HeyGen LiveAvatar FULL mode (real credentials required)
 *  - demo.ts    → clearly-labeled text/browser-speech interviewer (no video)
 *
 * Audio ownership: in typed HeyGen FULL mode the provider owns TTS, lip-sync,
 * and playback (LiveKit), while the browser only plays the remote tracks and
 * sends generated lines with `avatar.speak_text`. No microphone is captured.
 * In demo mode the browser owns typed input and optional
 * window.speechSynthesis playback.
 */
export interface CreateAvatarSessionInput {
  /** Our interview session id (used to label the per-session context). */
  interviewSessionId: string;
  language: InterviewLanguage;
  persona: InterviewerPersonaId;
  /** Max session seconds (duration budget + small grace). */
  maxSessionSeconds: number;
  /**
   * First line the provider should speak when the stream starts. For HeyGen
   * FULL mode this becomes the context `opening_text`; it is what makes the
   * avatar greet the candidate and ask the first question immediately instead
   * of waiting silently for user input.
   */
  openingText?: string;
}

export interface AvatarSessionStartResult {
  provider: "heygen" | "demo";
  /** Opaque provider session reference (HeyGen session_id). */
  providerSessionRef: string;
  /** Short-lived session token for the browser SDK (HeyGen only). */
  sessionToken?: string;
  /** Human-readable note surfaced in the UI (e.g. demo-mode explanation). */
  note?: string;
}

export interface AvatarProvider {
  readonly id: "heygen" | "demo";
  isConfigured(): boolean;
  createSession(input: CreateAvatarSessionInput): Promise<AvatarSessionStartResult>;
  /** Best-effort server-side stop/cleanup. Must not throw on missing sessions. */
  stopSession(providerSessionRef: string): Promise<void>;
  getSessionStatus(providerSessionRef: string): Promise<"active" | "ended" | "unknown">;
}
