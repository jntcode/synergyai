import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDate } from "@/lib/utils";
import {
  DIMENSION_LABELS,
  type EvaluationDimension,
} from "@/lib/ai/schemas";
import type {
  EvaluationRecord,
  InterviewSessionRecord,
  QuestionRecord,
  ReportRecord,
  TranscriptSegment,
} from "@/lib/db/types";

const REPORT_TYPE_LABELS: Record<InterviewSessionRecord["interviewType"], string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  mixed: "General",
  hr_screening: "HR screening",
  case_study: "Case study",
  role_specific: "Role-specific",
};

const REPORT_LEVEL_LABELS: Record<InterviewSessionRecord["difficulty"], string> = {
  beginner: "Entry",
  intermediate: "Mid",
  advanced: "Senior",
};

interface ReportViewProps {
  session: InterviewSessionRecord;
  report: ReportRecord;
  evaluations: EvaluationRecord[];
  questions: QuestionRecord[];
  transcript: TranscriptSegment[];
  backHref: string;
  backLabel: string;
  practiceHref: string;
  isGuest?: boolean;
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function scoreTone(score: number): string {
  if (score >= 70) return "bg-success";
  if (score >= 40) return "bg-warning";
  return "bg-destructive";
}

function aggregateDimensions(evaluations: EvaluationRecord[]) {
  const values = new Map<EvaluationDimension, number[]>();
  for (const evaluation of evaluations) {
    for (const dimension of evaluation.dimensionScores) {
      if (dimension.score === null) continue;
      const current = values.get(dimension.dimension) ?? [];
      current.push(dimension.score);
      values.set(dimension.dimension, current);
    }
  }
  return [...values.entries()]
    .map(([dimension, scores]) => ({
      dimension,
      score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    }))
    .sort((a, b) => b.score - a.score);
}

export function InterviewReportView({
  session,
  report,
  evaluations,
  questions,
  transcript,
  backHref,
  backLabel,
  practiceHref,
  isGuest = false,
}: ReportViewProps) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const strengths = unique(evaluations.flatMap((evaluation) => evaluation.strengths)).slice(0, 6);
  const improvements = unique(evaluations.flatMap((evaluation) => evaluation.improvements)).slice(0, 6);
  const dimensions = aggregateDimensions(evaluations);
  const roleTitle = session.plan?.roleTitle ?? "Practice interview";

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-20 pt-9 sm:px-8 sm:pt-12">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {backLabel}
      </Link>

      <header className="mt-7 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Practice report
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{roleTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {REPORT_TYPE_LABELS[session.interviewType]} ·{" "}
            {REPORT_LEVEL_LABELS[session.difficulty]} · {session.durationMinutes} min ·{" "}
            {formatDate(session.createdAt)}
          </p>
        </div>
        <Button asChild className="w-fit">
          <Link href={practiceHref}>
            <RotateCcw aria-hidden />
            Practice again
          </Link>
        </Button>
      </header>

      {isGuest && (
        <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-xs leading-5 text-muted-foreground">
          This guest report is available in this browser session. No account was created.
        </p>
      )}

      {session.isDemoAnalysis && (
        <Alert variant="demo" className="mt-6">
          <Sparkles className="size-4" aria-hidden />
          <AlertTitle>Labeled demo evaluation</AlertTitle>
          <AlertDescription>
            AI credentials were not configured for this session, so the questions and scores come
            from deterministic demo rules — not an AI model or a human assessor.
          </AlertDescription>
        </Alert>
      )}

      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)]">
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                Overall practice score
              </p>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold tabular-nums tracking-[-0.05em] sm:text-6xl">
                  {report.overallScore}
                </span>
                <span className="text-sm text-faint">/ 100</span>
              </p>
            </div>
            <Badge variant="secondary">Coaching estimate</Badge>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full ${scoreTone(report.overallScore)}`}
              style={{ width: `${report.overallScore}%` }}
            />
          </div>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">{report.summary}</p>
          <p className="mt-3 text-[11px] leading-5 text-faint">{report.disclaimer}</p>
        </div>

        <div className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-elevated p-6">
          <div>
            <Target className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
            <h2 className="mt-5 text-base font-medium">Keep the momentum</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Run the same setup again, or choose a new role to broaden your practice.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href={practiceHref}>
              Start another interview
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      {(strengths.length > 0 || improvements.length > 0) && (
        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" strokeWidth={1.5} aria-hidden />
              <h2 className="text-sm font-medium">What worked</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {strengths.length === 0 && (
                <li className="text-sm text-muted-foreground">No strengths were recorded.</li>
              )}
              {strengths.map((strength) => (
                <li key={strength} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-success" aria-hidden />
                  {strength}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2">
              <ArrowRight className="size-4 text-warning" strokeWidth={1.5} aria-hidden />
              <h2 className="text-sm font-medium">Where to focus next</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {improvements.length === 0 && (
                <li className="text-sm text-muted-foreground">No improvement areas were recorded.</li>
              )}
              {improvements.map((improvement) => (
                <li key={improvement} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-warning" aria-hidden />
                  {improvement}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
              By competency
            </p>
            <h2 className="mt-1.5 text-lg font-medium tracking-[-0.01em]">How you performed</h2>
          </div>
          <span className="text-xs text-faint">Rubric estimate</span>
        </div>
        <div className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {report.competencies.map((competency) => (
            <div key={competency.competency}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{competency.competency}</span>
                <span className="tabular-nums text-muted-foreground">{competency.score}/100</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full ${scoreTone(competency.score)}`}
                  style={{ width: `${competency.score}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{competency.note}</p>
            </div>
          ))}
        </div>
      </section>

      {dimensions.length > 0 && (
        <section className="mt-10">
          <div className="border-b border-border pb-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
              Communication &amp; structure
            </p>
            <h2 className="mt-1.5 text-lg font-medium tracking-[-0.01em]">
              How clearly your answers landed
            </h2>
          </div>
          <div className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {dimensions.map((dimension) => (
              <div key={dimension.dimension}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {DIMENSION_LABELS[dimension.dimension]}
                  </span>
                  <span className="tabular-nums text-foreground">{dimension.score}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${dimension.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="border-b border-border pb-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
            Question by question
          </p>
          <h2 className="mt-1.5 text-lg font-medium tracking-[-0.01em]">Specific feedback</h2>
        </div>
        <div className="mt-5 space-y-3">
          {evaluations.length === 0 && (
            <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
              No individual answer evaluations were recorded for this session.
            </p>
          )}
          {evaluations.map((evaluation, index) => {
            const question = evaluation.questionId
              ? questionById.get(evaluation.questionId)
              : null;
            return (
              <details
                key={evaluation.id}
                className="group rounded-xl border border-border bg-surface"
                open={index === 0}
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5">
                  <span className="min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
                      Question {question?.sequenceNumber ?? index + 1}
                      {question ? ` · ${question.competency}` : ""}
                    </span>
                    <span className="mt-1.5 block text-sm font-medium leading-6">
                      {question?.text ?? "Question"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {evaluation.overallScore}
                      <span className="text-faint">/100</span>
                    </span>
                    <ChevronDown
                      className="size-4 text-faint transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </span>
                </summary>

                <div className="space-y-5 border-t border-border p-5">
                  {evaluation.dimensionScores.filter((dimension) => dimension.score !== null).length >
                    0 && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {evaluation.dimensionScores
                        .filter((dimension) => dimension.score !== null)
                        .map((dimension) => (
                          <div key={dimension.dimension} className="rounded-lg bg-background p-3">
                            <div className="flex justify-between gap-2 text-[11px]">
                              <span className="capitalize text-muted-foreground">
                                {DIMENSION_LABELS[dimension.dimension]}
                              </span>
                              <span className="tabular-nums">{dimension.score}</span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${dimension.score}%` }}
                              />
                            </div>
                            <p className="mt-1.5 text-[10px] leading-4 text-faint">
                              {dimension.rationale}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}

                  <p className="text-sm leading-6 text-muted-foreground">{evaluation.summary}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-success">
                        What worked
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {evaluation.strengths.length === 0 && (
                          <li className="text-xs text-muted-foreground">No notable strengths recorded.</li>
                        )}
                        {evaluation.strengths.map((strength) => (
                          <li key={strength} className="text-xs leading-5 text-muted-foreground">
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
                        Improve
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {evaluation.improvements.length === 0 && (
                          <li className="text-xs text-muted-foreground">No specific improvements recorded.</li>
                        )}
                        {evaluation.improvements.map((improvement) => (
                          <li key={improvement} className="text-xs leading-5 text-muted-foreground">
                            {improvement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {evaluation.evidenceExcerpts.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                        From your answer
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {evaluation.evidenceExcerpts.map((excerpt) => (
                          <li
                            key={excerpt}
                            className="border-l-2 border-primary/50 pl-3 text-xs leading-5 text-muted-foreground"
                          >
                            “{excerpt}”
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {evaluation.exampleAnswer && (
                    <div className="rounded-lg border border-primary/15 bg-primary-soft p-3.5">
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                        A stronger way to answer
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-foreground/80">
                        {evaluation.exampleAnswer}
                      </p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {report.learningPlan.length > 0 && (
        <section className="mt-10">
          <div className="border-b border-border pb-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
              Next practice
            </p>
            <h2 className="mt-1.5 text-lg font-medium tracking-[-0.01em]">Your learning plan</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {report.learningPlan.map((item) => (
              <div key={item.focus} className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-sm font-medium">{item.focus}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.action}</p>
                <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-foreground">Practice prompt:</span>{" "}
                  {item.practiceQuestion}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {transcript.length > 0 && (
        <details className="group mt-10 rounded-xl border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
            <span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
                Full transcript
              </span>
              <span className="mt-1 block text-sm font-medium">Review the conversation</span>
            </span>
            <ChevronDown
              className="size-4 text-faint transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="space-y-4 border-t border-border p-5">
            {transcript.map((segment, index) => (
              <div key={`${segment.role}-${index}`}>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">
                  {segment.role === "interviewer" ? "Interviewer" : "You"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{segment.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-12 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-faint">
          Practice feedback is a coaching estimate, not a prediction of hiring outcomes. We never
          evaluate appearance, accent, or protected characteristics.
        </p>
        <Button asChild variant="secondary" className="shrink-0">
          <Link href={practiceHref}>
            <RotateCcw aria-hidden />
            Practice again
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function ReportNotReady({
  roomHref,
  practiceHref,
}: {
  roomHref: string;
  practiceHref: string;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-5 py-20 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-elevated text-muted-foreground">
        <Clock3 className="size-5" strokeWidth={1.5} aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Report not ready yet</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        This interview has not been completed, so there is no coaching report to show. Return to
        the room and finish the conversation first.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={roomHref}>
            <ArrowLeft aria-hidden />
            Back to interview
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={practiceHref}>Start a new practice</Link>
        </Button>
      </div>
    </div>
  );
}
