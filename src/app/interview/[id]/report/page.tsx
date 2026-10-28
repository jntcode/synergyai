import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUserRepo, resolveApiUser } from "@/lib/db";
import { SiteFooter, SiteNav } from "@/components/site-chrome";
import {
  InterviewReportView,
  ReportNotReady,
} from "@/components/interview/report-view";

export const metadata: Metadata = { title: "Practice report" };
// Session-scoped: reads the guest/demo cookie and the completed report at request time.
export const instant = false;

export default async function GuestReportPage({
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

  return (
    <>
      <SiteNav />
      <main className="flex-1">
        {!report || session.status !== "completed" ? (
          <ReportNotReady roomHref={`/interview/${id}`} practiceHref="/start" />
        ) : (
          <InterviewReportView
            session={session}
            report={report}
            evaluations={evaluations}
            questions={questions}
            transcript={transcript}
            backHref="/start"
            backLabel="Start another"
            practiceHref="/start"
            isGuest={user.mode === "guest"}
          />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
