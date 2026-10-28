import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError, jsonError, requireUser, RateLimitHttpError } from "@/lib/api";
import { getUserRepo } from "@/lib/db";
import { processCandidateAnswer } from "@/lib/interview/session-service";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isOpenAIConfigured } from "@/lib/env";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  answer: z.string().trim().min(1, "Answer cannot be empty").max(8000),
  source: z.enum(["typed", "demo_text", "avatar_stt"]).default("demo_text"),
});


/**
 * Typed turn endpoint used by both the demo interviewer and live HeyGen
 * sessions. Live mode is client-driven: this route generates the next
 * interviewer line, then the room asks the connected avatar to speak it with
 * the SDK's documented `avatar.speak_text` command.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const rl = checkRateLimit(`interview-turn:${user.userId}`, RATE_LIMITS.aiTurn);
    if (!rl.ok) {
      throw new RateLimitHttpError("Too many turns right now.", rl.retryAfterSeconds);
    }
    const { id } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const repo = await getUserRepo(user);
    const session = await repo.getSession(user.userId, id);
    if (!session) {
      return jsonError(404, "Session not found.", "not_found");
    }
    if (session.status !== "in_progress") {
      return jsonError(409, `Interview is not in progress (status: ${session.status}).`, "invalid_state");
    }

    const result = await processCandidateAnswer(repo, session, body.answer, body.source);
    const finished = result.event.type === "finish_interview";
    return NextResponse.json({
      event: result.event,
      session: result.session,
      finished,
      analysisMode: result.analysisMode,
      turnMode: result.turnMode,
      ai: isOpenAIConfigured(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
