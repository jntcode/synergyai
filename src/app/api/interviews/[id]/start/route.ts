import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError, requireUser, RateLimitHttpError } from "@/lib/api";
import { getUserRepo } from "@/lib/db";
import { AvatarConfigurationError, getAvatarProvider } from "@/lib/avatar";
import { DemoAvatarProvider } from "@/lib/avatar/demo";
import {
  currentQuestionText,
  prepareOpeningTurn,
  recordOpeningTurn,
  runOpeningTurn,
  type PreparedOpeningTurn,
} from "@/lib/interview/session-service";
import { computeTimeBudget, initialMemory } from "@/lib/interview/engine";
import { isOpenAIConfigured } from "@/lib/env";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  /** "auto" picks the configured provider; "demo" forces the labeled visual demo. */
  provider: z.enum(["auto", "demo"]).default("auto"),
});

/**
 * Start an interview:
 *  draft/preparing → ready → (provider session) → connecting → (opening) → in_progress
 *
 * The provider session is created BEFORE the ready→connecting transition so a
 * provider failure leaves the session restartable (e.g. retry in demo mode).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const { id } = paramsSchema.parse(await context.params);
    const rawBody: unknown = await request.json().catch(() => null);
    const body = bodySchema.parse(
      rawBody !== null && typeof rawBody === "object" ? rawBody : {},
    );
    const rl = checkRateLimit(`interview-start:${user.userId}`, RATE_LIMITS.interviewStart);
    if (!rl.ok) {
      throw new RateLimitHttpError(
        "Starting interviews is rate-limited; retry shortly.",
        rl.retryAfterSeconds,
      );
    }
    const repo = await getUserRepo(user);
    const session = await repo.getSession(user.userId, id);
    if (!session) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Session not found." } },
        { status: 404 },
      );
    }
    if (session.status === "completed" || session.status === "cancelled") {
      return NextResponse.json(
        { error: { code: "already_finished", message: "This interview has already ended." } },
        { status: 409 },
      );
    }
    if (session.status === "failed" || session.status === "evaluating") {
      return NextResponse.json(
        {
          error: {
            code: "not_restartable",
            message:
              "This interview can no longer be started. Create a new interview from your plan.",
          },
        },
        { status: 409 },
      );
    }
    if (!session.plan) {
      return NextResponse.json(
        { error: { code: "no_plan", message: "Interview plan missing; recreate the interview." } },
        { status: 409 },
      );
    }

    // A real resume means the interview already began (an opening was spoken).
    // `engineMemory` alone is not a reliable signal: a failed live start
    // persists a placeholder `initialMemory()` so the retry can prepare the
    // opening question again.
    const wasStarted = Boolean(session.startedAt) || session.status === "in_progress";

    let current = session;
    if (current.status === "draft" || current.status === "preparing") {
      current = await repo.updateSession(user.userId, id, { status: "ready" });
    }

    // Ensure engine memory exists before any turn.
    if (!current.engineMemory) {
      current = await repo.updateSession(user.userId, id, { engineMemory: initialMemory() });
    }

    const provider =
      body.provider === "demo" ? new DemoAvatarProvider() : getAvatarProvider();
    const isLiveProvider = provider.id === "heygen";
    const budget = computeTimeBudget(current.durationMinutes);

    // For a live session the opening question must exist before the provider
    // session is minted: HeyGen speaks the context `opening_text` as soon as
    // the WebRTC stream connects. Preparing it without persisting keeps a
    // provider failure restartable (no phantom transcript/status change).
    let openingPreview: PreparedOpeningTurn | null = null;
    let liveOpeningText: string | undefined;
    if (isLiveProvider) {
      if (!wasStarted) {
        openingPreview = prepareOpeningTurn(current);
        liveOpeningText = openingPreview.event.text;
      } else {
        // Reconnect/resume: repeat the question the candidate was answering.
        liveOpeningText = currentQuestionText(current) ?? undefined;
      }
      // Stop a stale provider session before creating a replacement. This is
      // best-effort; a missing/expired session must not block the retry.
      if (current.providerSessionRef && current.avatarProvider !== "demo") {
        await provider.stopSession(current.providerSessionRef).catch(() => undefined);
      }
    }

    let avatar;
    try {
      avatar = await provider.createSession({
        interviewSessionId: id,
        language: current.language,
        persona: current.persona,
        maxSessionSeconds: Math.min(budget.totalSeconds + 120, 3600),
        openingText: liveOpeningText,
      });
    } catch (err) {
      // Status stays "ready" — the user can retry or switch to demo mode. A
      // configuration problem is reported explicitly, never as a fake live
      // session or an unexplained failure.
      const message =
        err instanceof Error ? err.message : "The avatar provider could not start a session.";
      logger.error("interview.start_avatar_failed", {
        error: message,
        code: err instanceof AvatarConfigurationError ? err.code : undefined,
      });
      return NextResponse.json(
        {
          error: {
            code:
              err instanceof AvatarConfigurationError
                ? "avatar_configuration"
                : "avatar_unavailable",
            message,
            ...(err instanceof AvatarConfigurationError
              ? {
                  details: err.issues,
                  docsUrl: "https://docs.liveavatar.com/docs/full-mode/overview",
                }
              : {}),
          },
        },
        { status: 502 },
      );
    }

    if (current.status === "ready") {
      current = await repo.updateSession(user.userId, id, { status: "connecting" });
    }
    current = await repo.updateSession(user.userId, id, {
      avatarProvider: avatar.provider,
      providerSessionRef: avatar.providerSessionRef,
    });

    // Demo/text mode: the opening turn is produced here for display + browser
    // speech. Live HeyGen mode: the avatar speaks the context opening text, and
    // we persist the same turn now so the transcript/report are complete.
    if (avatar.provider === "demo") {
      if (wasStarted) {
        // Re-entering the room must not duplicate the opening transcript row.
        return NextResponse.json({
          session: current,
          openingEvent: null,
          avatar,
          analysisMode:
            current.isDemoAnalysis || !isOpenAIConfigured() ? "demo" : "ai",
          speechSynthesis:
            "Demo interviewer: spoken lines can use browser speechSynthesis and are always labeled as demo.",
        });
      }
      const opening = await runOpeningTurn(repo, current);
      return NextResponse.json({
        session: opening.session,
        openingEvent: opening.event,
        avatar,
        analysisMode: opening.analysisMode,
        speechSynthesis:
          "Demo interviewer: spoken lines can use browser speechSynthesis and are always labeled as demo.",
      });
    }

    if (openingPreview) {
      try {
        const opening = await recordOpeningTurn(repo, current, openingPreview);
        current = opening.session;
        return NextResponse.json({
          session: current,
          openingEvent: opening.event,
          avatar,
          analysisMode: opening.analysisMode,
          note: "Live avatar connected. The interviewer speaks the opening question with synchronized audio and video; typed answers are spoken through the same avatar.",
        });
      } catch (err) {
        // Do not leave a paid provider session running if persistence failed.
        await provider.stopSession(avatar.providerSessionRef).catch(() => undefined);
        throw err;
      }
    }

    // Resume/reconnect with existing engine memory: no new opening turn is
    // recorded. The avatar's context opening_text repeats the current question
    // once the fresh stream connects.
    if (current.engineMemory && current.status === "connecting") {
      current = await repo.updateSession(user.userId, id, {
        status: "in_progress",
        startedAt: current.startedAt ?? new Date().toISOString(),
      });
    }

    return NextResponse.json({
      session: current,
      openingEvent: null,
      avatar,
      analysisMode:
        current.isDemoAnalysis || !isOpenAIConfigured() ? "demo" : "ai",
      note: "Live avatar token minted. The browser attaches the real stream; typed answers are spoken by the avatar through avatar.speak_text.",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
