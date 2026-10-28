import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { llmBearerForSession } from "@/lib/avatar";
import { SupabaseRepo } from "@/lib/db/supabase-repo";
import { DemoRepo } from "@/lib/db/demo-repo";
import { isSupabaseConfigured, isSupabaseSecretConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { currentQuestionText, processCandidateAnswer } from "@/lib/interview/session-service";
import { initialMemory } from "@/lib/interview/engine";
import type { InterviewSessionRecord } from "@/lib/db/types";


const paramsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * OpenAI-compatible /chat/completions endpoint called by HeyGen LiveAvatar
 * (FULL mode + custom LLM configuration). The interview engine on this server
 * decides every interviewer utterance. HeyGen only handles STT/TTS/video.
 *
 * Auth: Authorization: Bearer <HMAC(LLM_SHARED_SECRET, session id)> — derived,
 * never stored, compared in constant time.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return badRequest("invalid_session_id");
  }
  const sessionId = parsedParams.data.id;

  const expected = llmBearerForSession(sessionId);
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!expected || !token || !constantTimeEquals(token, expected)) {
    logger.warn("llm.callback.auth_failed", { sessionId });
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  let body: { messages?: unknown; stream?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown; stream?: unknown };
  } catch {
    return badRequest("invalid_json");
  }
  const wantsStream = body.stream === true;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages]
    .reverse()
    .find(
      (m): m is { role: string; content: unknown } =>
        typeof m === "object" && m !== null && (m as { role?: string }).role === "user",
    );
  const userText = extractText(lastUser?.content);

  // System repo (service key) — no user session on this callback path.
  // In labeled demo mode (no Supabase secret) fall back to the in-memory store.
  const useSupabase = isSupabaseConfigured() && isSupabaseSecretConfigured();
  const repo = useSupabase ? SupabaseRepo.forSystem() : new DemoRepo();

  let session: InterviewSessionRecord | null = null;
  if (useSupabase) {
    session = await (repo as SupabaseRepo).getSessionSystem(sessionId);
  } else {
    session = findDemoSession(sessionId);
  }
  if (!session) {
    logger.warn("llm.callback.session_missing", { sessionId });
    return badRequest("session_not_found");
  }

  try {
    let text: string;
    if (!session.engineMemory) {
      session = await repo.updateSession(
        session.userId,
        sessionId,
        { engineMemory: initialMemory() },
        { skipTransitionCheck: true },
      );
    }

    if (session.status === "connecting" || session.status === "ready") {
      // The start route owns persistence of the opening turn (it must happen
      // before the provider session becomes visible). Return the same question
      // without mutating the transcript, so a provider call cannot duplicate
      // the opening row.
      text =
        currentQuestionText(session) ??
        (session.language === "pt"
          ? "A entrevista está sendo preparada. Um momento, por favor."
          : "The interview is being prepared. One moment, please.");
    } else if (session.status === "in_progress") {
      if (!userText || userText.trim().length === 0) {
        // Avatar is ready to talk but the candidate has not answered yet.
        text =
          session.language === "pt"
            ? "Pode continuar — estou ouvindo."
            : "Please go ahead — I'm listening.";
      } else {
        const result = await processCandidateAnswer(
          repo,
          session,
          userText,
          "avatar_stt",
        );
        text = result.event.text;
      }
    } else {
      // evaluating / completed / cancelled — brief close; no engine changes.
      text =
        session.language === "pt"
          ? "A entrevista já foi encerrada. Obrigado!"
          : "The interview has already ended. Thank you!";
    }

    if (wantsStream) {
      return streamCompletion(sessionId, text);
    }

    return NextResponse.json({
      id: `synergy-${sessionId.slice(0, 8)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "synergy-interview-engine",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (err) {
    logger.error("llm.callback.failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: { message: "Interview engine error" } },
      { status: 500 },
    );
  }
}

/**
 * OpenAI-compatible SSE response. The engine has already produced the full
 * line; streaming it word-by-word lets the provider start TTS as soon as the
 * first content chunk arrives instead of waiting for the whole sentence.
 */
function streamCompletion(sessionId: string, text: string): Response {
  const id = `synergy-${sessionId.slice(0, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const frame = (payload: unknown) =>
    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const chunk = (
    delta: Record<string, unknown>,
    finishReason: string | null,
  ) => ({
    id,
    object: "chat.completion.chunk",
    created,
    model: "synergy-interview-engine",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });

  const words = text.match(/\S+\s*/g) ?? [text];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(frame(chunk({ role: "assistant", content: "" }, null)));
      for (const word of words) {
        controller.enqueue(frame(chunk({ content: word }, null)));
      }
      controller.enqueue(frame(chunk({}, "stop")));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join(" ");
  }
  return "";
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function badRequest(code: string): NextResponse {
  return NextResponse.json({ error: { message: code } }, { status: 400 });
}

function findDemoSession(sessionId: string): InterviewSessionRecord | null {
  // Access the singleton demo store without duplicating state.
  const g = globalThis as unknown as {
    __synergyDemoState?: {
      sessions: Map<string, InterviewSessionRecord>;
    };
  };
  return g.__synergyDemoState?.sessions.get(sessionId) ?? null;
}
