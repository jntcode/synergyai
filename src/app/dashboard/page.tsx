"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Clock,
  FileText,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { INTERVIEW_TYPE_LABELS, type InterviewType } from "@/lib/ai/schemas";
import { formatDate } from "@/lib/utils";
import { useHealth, useMe } from "@/lib/hooks";
import type { SessionSummary } from "@/lib/db/types";

interface ListResponse {
  sessions: SessionSummary[];
  mode: "supabase" | "demo";
  ai: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "demo"> = {
  completed: "success",
  in_progress: "warning",
  preparing: "secondary",
  ready: "secondary",
  connecting: "warning",
  evaluating: "warning",
  failed: "destructive",
  cancelled: "secondary",
  draft: "secondary",
};

export default function DashboardPage() {
  const { me, loading: meLoading } = useMe();
  const { health } = useHealth();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/interviews")
      .then(async (r) => {
        const json = (await r.json()) as ListResponse & { error?: { message?: string } };
        if (!r.ok) throw new Error(json.error?.message ?? "Failed to load");
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sessions = data?.sessions ?? [];
  const completed = sessions.filter((s) => s.status === "completed");
  const avgScore =
    completed.length > 0
      ? Math.round(
          completed.reduce((sum, s) => sum + (s.reportOverallScore ?? 0), 0) / completed.length,
        )
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {meLoading
              ? "Welcome"
              : `Welcome${me?.profile?.displayName ? `, ${me.profile.displayName}` : ""}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Practice an interview tailored to a real job description.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/interviews/new">
            <Plus aria-hidden />
            New interview
          </Link>
        </Button>
      </div>

      {data?.mode === "demo" && (
        <Alert variant="demo">
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription>
            You are exploring with an in-memory demo account. Data is not persistent and AI/avatar
            features are clearly labeled. Connect Supabase and OpenAI for the full experience.
          </AlertDescription>
        </Alert>
      )}
      {health && !health.features.openai && (
        <Alert variant="warning">
          <AlertTitle>AI analysis not configured</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">OPENAI_API_KEY</code> to enable AI-generated
            interview plans and evaluations. Until then, plans use labeled demo heuristics.
          </AlertDescription>
        </Alert>
      )}
      {health && health.features.supabase && !health.features.supabaseSecret && (
        <Alert variant="warning">
          <AlertTitle>Supabase secret key missing</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-xs">SUPABASE_SECRET_KEY</code> so live avatar
            callbacks can persist data.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Interviews</CardDescription>
            <p className="text-2xl font-semibold tabular-nums">{sessions.length}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Completed</CardDescription>
            <p className="text-2xl font-semibold tabular-nums">{completed.length}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Average score</CardDescription>
            <p className="text-2xl font-semibold tabular-nums">
              {avgScore !== null ? avgScore : "—"}
            </p>
          </CardHeader>
        </Card>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent interviews</h2>
          {sessions.length > 0 && (
            <Badge variant="secondary">
              <TrendingUp className="mr-1 size-3" aria-hidden />
              History
            </Badge>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && sessions.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Target className="size-7" aria-hidden />
              </div>
              <div>
                <p className="font-medium">No interviews yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Paste a job description and we will build a personalized interview plan with a
                  coaching report at the end.
                </p>
              </div>
              <Button asChild>
                <Link href="/dashboard/interviews/new">
                  <Sparkles aria-hidden />
                  Start your first interview
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && sessions.length > 0 && (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <Card className="transition-shadow hover:shadow-soft">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{s.jobTitle}</p>
                        <Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>
                          {s.status.replace("_", " ")}
                        </Badge>
                        {s.avatarProvider === "demo" && (
                          <Badge variant="demo">Demo interviewer</Badge>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" aria-hidden />
                          {INTERVIEW_TYPE_LABELS[s.interviewType as InterviewType] ?? s.interviewType}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" aria-hidden />
                          {s.durationMinutes} min
                        </span>
                        <span>{formatDate(s.createdAt)}</span>
                        {s.reportOverallScore !== null && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <BarChart3 className="size-3" aria-hidden />
                            {s.reportOverallScore}/100
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {s.status === "completed" ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/dashboard/interviews/${s.id}/report`}>
                            View report
                            <ArrowRight aria-hidden />
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm">
                          <Link href={`/dashboard/interviews/${s.id}`}>
                            {s.status === "preparing" || s.status === "ready"
                              ? "Continue setup"
                              : "Open"}
                            <ArrowRight aria-hidden />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
