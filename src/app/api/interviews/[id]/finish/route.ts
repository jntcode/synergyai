import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError, jsonError, requireUser, RateLimitHttpError } from "@/lib/api";
import { getUserRepo } from "@/lib/db";
import { finishInterview } from "@/lib/interview/session-service";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getAvatarProvider } from "@/lib/avatar";
import { logger } from "@/lib/logger";


const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * End the interview: stop the provider session, evaluate answers, persist the
 * report. Idempotent — safe to call twice (no duplicate report generation).
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const rl = checkRateLimit(`interview-finish:${user.userId}`, RATE_LIMITS.aiHeavy);
    if (!rl.ok) {
      throw new RateLimitHttpError("Finishing is rate-limited; retry shortly.", rl.retryAfterSeconds);
    }
    const { id } = paramsSchema.parse(await context.params);
    const repo = await getUserRepo(user);
    const session = await repo.getSession(user.userId, id);
    if (!session) return jsonError(404, "Session not found.", "not_found");

    // Best-effort provider cleanup before evaluation.
    if (session.providerSessionRef && session.avatarProvider !== "demo") {
      await getAvatarProvider().stopSession(session.providerSessionRef).catch(() => undefined);
    }

    // Normalize status into evaluating if still active (valid transition).
    let current = session;
    if (current.status === "in_progress" || current.status === "connecting") {
      try {
        current = await repo.updateSession(user.userId, id, {
          status: "evaluating",
          endedAt: current.endedAt ?? new Date().toISOString(),
        });
      } catch (err) {
        logger.warn("interview.finish_transition_warn", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result = await finishInterview(repo, current);
    const report = await repo.getReport(user.userId, id);
    const finalSession = await repo.getSession(user.userId, id);
    return NextResponse.json({
      ok: true,
      report,
      session: finalSession,
      analysisMode: result.analysisMode,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
