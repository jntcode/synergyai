import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleRouteError, requireUser } from "@/lib/api";
import { getUserRepo } from "@/lib/db";
import { isOpenAIConfigured } from "@/lib/env";


const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const { id } = paramsSchema.parse(await context.params);
    const repo = await getUserRepo(user);
    const session = await repo.getSession(user.userId, id);
    if (!session) return NextResponse.json({ error: { code: "not_found", message: "Session not found." } }, { status: 404 });
    const [questions, transcript, report, answers] = await Promise.all([
      repo.listQuestions(id),
      repo.listTranscript(user.userId, id),
      repo.getReport(user.userId, id),
      repo.listAnswers(user.userId, id),
    ]);
    return NextResponse.json({
      session,
      questions,
      transcript,
      report,
      answerCount: answers.length,
      ai: isOpenAIConfigured(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
