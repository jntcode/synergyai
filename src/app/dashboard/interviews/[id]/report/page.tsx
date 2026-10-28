import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveApiUser, getUserRepo } from "@/lib/db";
import {
  InterviewReportView,
  ReportNotReady,
} from "@/components/interview/report-view";

export const metadata: Metadata = { title: "Interview report" };
// Session-scoped: reads cookies and live report state at request time.
export const instant = false;

export default async function ReportPage({
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

  const [report, evaluations, questions, transcript] = await Promise.all([
    repo.getReport(user.userId, id),
    repo.listEvaluations(user.userId, id),
    repo.listQuestions(id),
    repo.listTranscript(user.userId, id),
  ]);

  if (!report || session.status !== "completed") {
    return (
      <ReportNotReady
        roomHref={`/interview/${id}`}
        practiceHref="/dashboard/interviews/new"
      />
    );
  }

  return (
    <InterviewReportView
      session={session}
      report={report}
      evaluations={evaluations}
      questions={questions}
      transcript={transcript}
      backHref="/dashboard"
      backLabel="Dashboard"
      practiceHref="/dashboard/interviews/new"
    />
  );
}
