import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getServerEnv,
  isSupabaseConfigured,
  isSupabaseSecretConfigured,
} from "@/lib/env";
import { assertTransition } from "@/lib/interview/state-machine";
import type {
  AnswerRecord,
  AnswerSource,
  CreateSessionInput,
  EvaluationRecord,
  InterviewSessionRecord,
  Profile,
  QuestionRecord,
  ReportRecord,
  SessionSummary,
  TranscriptSegment,
} from "@/lib/db/types";
import type { AnswerEvaluation, FinalReport, InterviewLanguage } from "@/lib/ai/schemas";
import type { DataRepo } from "@/lib/db/demo-repo";
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

/** Map a DB row (snake_case) into domain types (camelCase). */
function mapSession(row: Row): InterviewSessionRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    jobDescriptionId: (row.job_description_id as string | null) ?? null,
    interviewType: row.interview_type as InterviewSessionRecord["interviewType"],
    language: row.language as InterviewLanguage,
    difficulty: row.difficulty as InterviewSessionRecord["difficulty"],
    durationMinutes: row.duration_minutes as number,
    persona: row.persona as InterviewSessionRecord["persona"],
    status: row.status as InterviewSessionRecord["status"],
    avatarProvider: (row.avatar_provider as string) ?? "demo",
    providerSessionRef: (row.provider_session_ref as string | null) ?? null,
    plan: (row.plan as InterviewSessionRecord["plan"]) ?? null,
    engineMemory: (row.engine_memory as InterviewSessionRecord["engineMemory"]) ?? null,
    isDemoAnalysis: Boolean(row.is_demo_analysis),
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapQuestion(row: Row): QuestionRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    sequenceNumber: row.sequence_number as number,
    text: row.question_text as string,
    category: (row.category as string) ?? "mixed",
    competency: (row.competency as string) ?? "",
    keyPoints: (row.key_points as string[]) ?? [],
    dimensions: (row.dimensions as QuestionRecord["dimensions"]) ?? [],
    createdAt: row.created_at as string,
  };
}

function mapAnswer(row: Row): AnswerRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    questionId: (row.question_id as string | null) ?? null,
    transcript: row.transcript as string,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    source: (row.source as AnswerSource) ?? "typed",
    createdAt: row.created_at as string,
  };
}

function mapEvaluation(row: Row): EvaluationRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    questionId: (row.question_id as string | null) ?? null,
    overallScore: Number(row.overall_score ?? 0),
    dimensionScores: (row.dimension_scores as EvaluationRecord["dimensionScores"]) ?? [],
    strengths: (row.strengths as string[]) ?? [],
    improvements: (row.improvements as string[]) ?? [],
    evidenceExcerpts: (row.evidence_excerpts as string[]) ?? [],
    exampleAnswer: (row.example_answer as string | null) ?? null,
    summary: (row.summary as string) ?? "",
    createdAt: row.created_at as string,
  };
}

function mapReport(row: Row): ReportRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    summary: (row.summary as string) ?? "",
    overallScore: Number(row.overall_score ?? 0),
    competencies: (row.competencies as ReportRecord["competencies"]) ?? [],
    learningPlan: (row.learning_plan as ReportRecord["learningPlan"]) ?? [],
    disclaimer: (row.disclaimer as string) ?? "",
    createdAt: row.created_at as string,
  };
}

/**
 * Supabase-backed repository.
 * - `mode: "user"` uses the caller's JWT (RLS enforced by the database).
 * - `mode: "system"` uses the secret/service key (server-only) for paths where
 *   no user session exists (e.g. HeyGen → our LLM callback). Ownership is still
 *   validated in every query.
 */
export class SupabaseRepo implements DataRepo {
  constructor(private readonly supabase: SupabaseClient) {}

  static forUser(userClient: SupabaseClient): SupabaseRepo {
    return new SupabaseRepo(userClient);
  }

  static forSystem(): SupabaseRepo {
    const env = getServerEnv();
    if (!isSupabaseConfigured(env) || !isSupabaseSecretConfigured(env)) {
      throw new Error(
        "Supabase system access is not configured (need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).",
      );
    }
    const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabaseRepo(client);
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(`profiles select failed: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      displayName: data.display_name,
      preferredLanguage: data.preferred_language,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async upsertProfile(
    userId: string,
    patch: Partial<Pick<Profile, "displayName" | "preferredLanguage">>,
  ): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: patch.displayName ?? null,
          preferred_language: patch.preferredLanguage ?? "en",
          updated_at: nowIso(),
        },
        { onConflict: "id" },
      )
      .select()
      .single();
    if (error) throw new Error(`profiles upsert failed: ${error.message}`);
    return {
      id: data.id,
      displayName: data.display_name,
      preferredLanguage: data.preferred_language,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async listSessions(userId: string): Promise<SessionSummary[]> {
    const { data, error } = await this.supabase
      .from("interview_sessions")
      .select(
        `id, interview_type, language, difficulty, duration_minutes, persona, status,
         avatar_provider, started_at, ended_at, created_at,
         job_descriptions ( job_title, company_name ),
         interview_reports ( overall_score )`,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`sessions list failed: ${error.message}`);
    return (data ?? []).map((row) => {
      const jd = row.job_descriptions as unknown as {
        job_title: string;
        company_name: string | null;
      } | null;
      const report = Array.isArray(row.interview_reports)
        ? (row.interview_reports[0] as { overall_score: number | null } | null)
        : (row.interview_reports as { overall_score: number | null } | null);
      return {
        id: row.id as string,
        jobTitle: jd?.job_title ?? "Untitled role",
        companyName: jd?.company_name ?? null,
        interviewType: row.interview_type as SessionSummary["interviewType"],
        language: row.language as SessionSummary["language"],
        difficulty: row.difficulty as SessionSummary["difficulty"],
        durationMinutes: row.duration_minutes as number,
        persona: row.persona as SessionSummary["persona"],
        status: row.status as SessionSummary["status"],
        avatarProvider: (row.avatar_provider as string) ?? "demo",
        startedAt: (row.started_at as string | null) ?? null,
        endedAt: (row.ended_at as string | null) ?? null,
        createdAt: row.created_at as string,
        reportOverallScore: report?.overall_score ?? null,
      };
    });
  }

  async createSession(input: CreateSessionInput): Promise<InterviewSessionRecord> {
    const sessionId = randomUUID();
    const { data: jd, error: jdErr } = await this.supabase
      .from("job_descriptions")
      .insert({
        id: randomUUID(),
        user_id: input.userId,
        job_title: input.jobTitle,
        company_name: input.companyName,
        raw_description: input.rawDescription,
        parsed: input.parsed ?? null,
        language: input.language,
      })
      .select("id")
      .single();
    if (jdErr) throw new Error(`job_descriptions insert failed: ${jdErr.message}`);

    const { data, error } = await this.supabase
      .from("interview_sessions")
      .insert({
        id: sessionId,
        user_id: input.userId,
        job_description_id: jd.id,
        interview_type: input.interviewType,
        language: input.language,
        difficulty: input.difficulty,
        duration_minutes: input.durationMinutes,
        persona: input.persona,
        status: "preparing",
        avatar_provider: "demo",
        plan: input.plan,
        is_demo_analysis: input.isDemoAnalysis,
      })
      .select()
      .single();
    if (error) throw new Error(`interview_sessions insert failed: ${error.message}`);
    return mapSession(data as Row);
  }

  async getSession(userId: string, sessionId: string): Promise<InterviewSessionRecord | null> {
    const { data, error } = await this.supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`sessions select failed: ${error.message}`);
    return data ? mapSession(data as Row) : null;
  }

  async getSessionSystem(sessionId: string): Promise<InterviewSessionRecord | null> {
    const { data, error } = await this.supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`sessions select failed: ${error.message}`);
    return data ? mapSession(data as Row) : null;
  }

  async updateSession(
    userId: string,
    sessionId: string,
    patch: Partial<
      Pick<
        InterviewSessionRecord,
        "status" | "avatarProvider" | "providerSessionRef" | "engineMemory" | "startedAt" | "endedAt"
      >
    >,
    opts?: { skipTransitionCheck?: boolean },
  ): Promise<InterviewSessionRecord> {
    const current = await this.getSession(userId, sessionId);
    if (!current) throw new Error("Session not found");
    if (patch.status && !opts?.skipTransitionCheck) {
      assertTransition(current.status, patch.status);
    }
    const dbPatch: Row = { updated_at: nowIso() };
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.avatarProvider !== undefined) dbPatch.avatar_provider = patch.avatarProvider;
    if (patch.providerSessionRef !== undefined) dbPatch.provider_session_ref = patch.providerSessionRef;
    if (patch.engineMemory !== undefined) dbPatch.engine_memory = patch.engineMemory;
    if (patch.startedAt !== undefined) dbPatch.started_at = patch.startedAt;
    if (patch.endedAt !== undefined) dbPatch.ended_at = patch.endedAt;
    const { data, error } = await this.supabase
      .from("interview_sessions")
      .update(dbPatch)
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(`sessions update failed: ${error.message}`);
    return mapSession(data as Row);
  }

  async listQuestions(sessionId: string): Promise<QuestionRecord[]> {
    const { data, error } = await this.supabase
      .from("interview_questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sequence_number", { ascending: true });
    if (error) throw new Error(`questions list failed: ${error.message}`);
    return (data ?? []).map(mapQuestion);
  }

  async replaceQuestions(sessionId: string, questions: QuestionRecord[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from("interview_questions")
      .delete()
      .eq("session_id", sessionId);
    if (delErr) throw new Error(`questions delete failed: ${delErr.message}`);
    if (questions.length === 0) return;
    const { error } = await this.supabase.from("interview_questions").insert(
      questions.map((q) => ({
        id: q.id,
        session_id: sessionId,
        sequence_number: q.sequenceNumber,
        question_text: q.text,
        category: q.category,
        competency: q.competency,
        key_points: q.keyPoints,
        dimensions: q.dimensions,
      })),
    );
    if (error) throw new Error(`questions insert failed: ${error.message}`);
  }

  async addAnswer(input: {
    userId: string;
    sessionId: string;
    questionId: string | null;
    transcript: string;
    source: AnswerSource;
    durationSeconds?: number | null;
  }): Promise<AnswerRecord> {
    const session = await this.getSession(input.userId, input.sessionId);
    if (!session) throw new Error("Session not found");
    const row = {
      id: randomUUID(),
      session_id: input.sessionId,
      question_id: input.questionId,
      transcript: input.transcript,
      duration_seconds: input.durationSeconds ?? null,
      source: input.source,
    };
    const { data, error } = await this.supabase
      .from("interview_answers")
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(`answers insert failed: ${error.message}`);
    return mapAnswer(data as Row);
  }

  async listAnswers(userId: string, sessionId: string): Promise<AnswerRecord[]> {
    const session = await this.getSession(userId, sessionId);
    if (!session) return [];
    const { data, error } = await this.supabase
      .from("interview_answers")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`answers list failed: ${error.message}`);
    return (data ?? []).map(mapAnswer);
  }

  async addEvaluations(
    userId: string,
    sessionId: string,
    evals: AnswerEvaluation[],
  ): Promise<EvaluationRecord[]> {
    const session = await this.getSession(userId, sessionId);
    if (!session) throw new Error("Session not found");
    if (evals.length === 0) return [];
    const { data, error } = await this.supabase
      .from("interview_evaluations")
      .insert(
        evals.map((e) => ({
          id: randomUUID(),
          session_id: sessionId,
          question_id: e.questionId,
          overall_score: e.overallScore,
          dimension_scores: e.dimensionScores,
          strengths: e.strengths,
          improvements: e.improvements,
          evidence_excerpts: e.evidenceExcerpts,
          example_answer: e.exampleAnswer,
          summary: e.summary,
        })),
      )
      .select();
    if (error) throw new Error(`evaluations insert failed: ${error.message}`);
    return (data ?? []).map(mapEvaluation);
  }

  async listEvaluations(userId: string, sessionId: string): Promise<EvaluationRecord[]> {
    const session = await this.getSession(userId, sessionId);
    if (!session) return [];
    const { data, error } = await this.supabase
      .from("interview_evaluations")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`evaluations list failed: ${error.message}`);
    return (data ?? []).map(mapEvaluation);
  }

  async saveReport(userId: string, sessionId: string, report: FinalReport): Promise<ReportRecord> {
    const session = await this.getSession(userId, sessionId);
    if (!session) throw new Error("Session not found");
    const { data, error } = await this.supabase
      .from("interview_reports")
      .upsert(
        {
          session_id: sessionId,
          summary: report.summary,
          overall_score: report.overallScore,
          competencies: report.competencies,
          learning_plan: report.learningPlan,
          disclaimer: report.disclaimer,
          updated_at: nowIso(),
        },
        { onConflict: "session_id" },
      )
      .select()
      .single();
    if (error) throw new Error(`report upsert failed: ${error.message}`);
    return mapReport(data as Row);
  }

  async getReport(userId: string, sessionId: string): Promise<ReportRecord | null> {
    const session = await this.getSession(userId, sessionId);
    if (!session) return null;
    const { data, error } = await this.supabase
      .from("interview_reports")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`report select failed: ${error.message}`);
    return data ? mapReport(data as Row) : null;
  }

  async appendTranscript(
    userId: string,
    sessionId: string,
    segments: TranscriptSegment[],
  ): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (!session) throw new Error("Session not found");
    if (segments.length === 0) return;
    const { error } = await this.supabase.from("interview_transcript_segments").insert(
      segments.map((s) => ({
        session_id: sessionId,
        role: s.role,
        text: s.text,
        segment_at: s.at,
      })),
    );
    if (error) throw new Error(`transcript insert failed: ${error.message}`);
  }

  async listTranscript(userId: string, sessionId: string): Promise<TranscriptSegment[]> {
    const session = await this.getSession(userId, sessionId);
    if (!session) return [];
    const { data, error } = await this.supabase
      .from("interview_transcript_segments")
      .select("role, text, segment_at")
      .eq("session_id", sessionId)
      .order("segment_at", { ascending: true });
    if (error) throw new Error(`transcript list failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      role: row.role as TranscriptSegment["role"],
      text: row.text as string,
      at: row.segment_at as string,
    }));
  }

  async logUsage(
    userId: string,
    eventType: string,
    quantity: number,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase.from("usage_events").insert({
      user_id: userId,
      event_type: eventType,
      quantity,
      metadata: meta ?? null,
    });
    if (error) {
      // Usage logging must never break the main flow.
      console.warn(`usage_events insert failed: ${error.message}`);
    }
  }

  async deleteAllUserData(userId: string): Promise<void> {
    // Cascades via FK (sessions → questions/answers/evaluations/reports/transcript).
    const { error: jdErr } = await this.supabase
      .from("job_descriptions")
      .delete()
      .eq("user_id", userId);
    if (jdErr) throw new Error(`delete job_descriptions failed: ${jdErr.message}`);
    const { error: sessErr } = await this.supabase
      .from("interview_sessions")
      .delete()
      .eq("user_id", userId);
    if (sessErr) throw new Error(`delete interview_sessions failed: ${sessErr.message}`);
  }
}

export type { DataRepo };
