import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { resolveApiUser, getUserRepo } from "@/lib/db";
import { InterviewRoom } from "@/components/interview/room";

export const metadata: Metadata = { title: "Interview room" };
// Session-scoped: reads cookies and live interview state at request time.
export const instant = false;

function secondsRemaining(startedAt: string | null, durationMinutes: number): number {
  const elapsed = startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    : 0;
  return Math.max(0, durationMinutes * 60 - elapsed);
}

export default async function PublicInterviewRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await resolveApiUser();
  if (!user) notFound();
  const repo = await getUserRepo(user);
  const session = await repo.getSession(user.userId, id);
  if (!session) notFound();
  if (session.status === "completed") redirect(`/interview/${id}/report`);
  const transcript = await repo.listTranscript(user.userId, id);

  return (
    <InterviewRoom
      key={session.id}
      sessionId={session.id}
      initialSession={{
        id: session.id,
        status: session.status,
        durationMinutes: session.durationMinutes,
        language: session.language,
        persona: session.persona,
        avatarProvider: session.avatarProvider,
        plan: session.plan,
        startedAt: session.startedAt,
        remainingSeconds: secondsRemaining(session.startedAt, session.durationMinutes),
      }}
      initialTranscript={transcript.map((segment) => ({
        role: segment.role,
        text: segment.text,
      }))}
    />
  );
}
