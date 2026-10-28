import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError, jsonError, requireUser } from "@/lib/api";
import { getUserRepo } from "@/lib/db";


const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  segments: z
    .array(
      z.object({
        role: z.enum(["interviewer", "candidate"]),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

/** Append live transcript segments captured by the client (avatar STT events). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const { id } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const repo = await getUserRepo(user);
    const session = await repo.getSession(user.userId, id);
    if (!session) return jsonError(404, "Session not found.", "not_found");
    // Reject post-hoc appends once the interview is over — the report's evidence
    // excerpts must keep matching the stored transcript.
    if (session.status === "completed" || session.status === "cancelled") {
      return jsonError(
        409,
        "Transcript is closed for this interview.",
        "transcript_closed",
      );
    }
    await repo.appendTranscript(
      user.userId,
      id,
      body.segments.map((s) => ({ ...s, at: new Date().toISOString() })),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const { id } = paramsSchema.parse(await context.params);
    const repo = await getUserRepo(user);
    const transcript = await repo.listTranscript(user.userId, id);
    return NextResponse.json({ transcript });
  } catch (err) {
    return handleRouteError(err);
  }
}
