import "server-only";
import { randomUUID } from "node:crypto";
import type {
  AnswerRecord,
  AnswerSource,
  CreateSessionInput,
  EvaluationRecord,
  InterviewSessionRecord,
  JobDescriptionRecord,
  Profile,
  QuestionRecord,
  ReportRecord,
  SessionSummary,
  TranscriptSegment,
} from "@/lib/db/types";
import type { AnswerEvaluation, FinalReport } from "@/lib/ai/schemas";
import { assertTransition, type SessionStatus } from "@/lib/interview/state-machine";

/**
 * Repository abstraction. Two implementations:
 *  - SupabaseRepo (user-scoped via RLS, or system-scoped with the secret key)
 *  - DemoRepo (in-memory, single process, used only in labeled demo mode)
 * All ownership checks that RLS cannot express are performed here server-side.
 */
export interface DataRepo {
  getProfile(userId: string): Promise<Profile | null>;
  upsertProfile(userId: string, patch: Partial<Pick<Profile, "displayName" | "preferredLanguage">>): Promise<Profile>;

  listSessions(userId: string): Promise<SessionSummary[]>;
  createSession(input: CreateSessionInput): Promise<InterviewSessionRecord>;
  getSession(userId: string, sessionId: string): Promise<InterviewSessionRecord | null>;
  updateSession(
    userId: string,
    sessionId: string,
    patch: Partial<
      Pick<
        InterviewSessionRecord,
        "status" | "avatarProvider" | "providerSessionRef" | "engineMemory" | "startedAt" | "endedAt"
      >
    >,
    opts?: { skipTransitionCheck?: boolean },
  ): Promise<InterviewSessionRecord>;

  listQuestions(sessionId: string): Promise<QuestionRecord[]>;
  replaceQuestions(sessionId: string, questions: QuestionRecord[]): Promise<void>;

  addAnswer(input: {
    userId: string;
    sessionId: string;
    questionId: string | null;
    transcript: string;
    source: AnswerSource;
    durationSeconds?: number | null;
  }): Promise<AnswerRecord>;
  listAnswers(userId: string, sessionId: string): Promise<AnswerRecord[]>;

  addEvaluations(userId: string, sessionId: string, evals: AnswerEvaluation[]): Promise<EvaluationRecord[]>;
  listEvaluations(userId: string, sessionId: string): Promise<EvaluationRecord[]>;

  saveReport(userId: string, sessionId: string, report: FinalReport): Promise<ReportRecord>;
  getReport(userId: string, sessionId: string): Promise<ReportRecord | null>;

  appendTranscript(userId: string, sessionId: string, segments: TranscriptSegment[]): Promise<void>;
  listTranscript(userId: string, sessionId: string): Promise<TranscriptSegment[]>;

  logUsage(userId: string, eventType: string, quantity: number, meta?: Record<string, unknown>): Promise<void>;
  deleteAllUserData(userId: string): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── In-memory demo repository ───────────────────────────────────────────────

interface DemoState {
  profiles: Map<string, Profile>;
  jobDescriptions: Map<string, JobDescriptionRecord>;
  sessions: Map<string, InterviewSessionRecord>;
  questions: Map<string, QuestionRecord[]>;
  answers: Map<string, AnswerRecord[]>;
  evaluations: Map<string, EvaluationRecord[]>;
  reports: Map<string, ReportRecord>;
  transcripts: Map<string, TranscriptSegment[]>;
  usage: { userId: string; eventType: string; quantity: number; at: string }[];
}

function freshState(): DemoState {
  return {
    profiles: new Map(),
    jobDescriptions: new Map(),
    sessions: new Map(),
    questions: new Map(),
    answers: new Map(),
    evaluations: new Map(),
    reports: new Map(),
    transcripts: new Map(),
    usage: [],
  };
}

/** Singleton demo state (per server process). NOT persistent — labeled demo mode only. */
const globalStore = globalThis as unknown as { __synergyDemoState?: DemoState };
const demoState: DemoState = (globalStore.__synergyDemoState ??= freshState());

export function resetDemoStore(): void {
  globalStore.__synergyDemoState = freshState();
}

export class DemoRepo implements DataRepo {
  constructor(private readonly state: DemoState = demoState) {}

  async getProfile(userId: string): Promise<Profile | null> {
    return this.state.profiles.get(userId) ?? null;
  }

  async upsertProfile(
    userId: string,
    patch: Partial<Pick<Profile, "displayName" | "preferredLanguage">>,
  ): Promise<Profile> {
    const existing = this.state.profiles.get(userId);
    const profile: Profile = {
      id: userId,
      displayName: patch.displayName ?? existing?.displayName ?? "Demo User",
      preferredLanguage: patch.preferredLanguage ?? existing?.preferredLanguage ?? "en",
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.state.profiles.set(userId, profile);
    return profile;
  }

  async listSessions(userId: string): Promise<SessionSummary[]> {
    const jobs = this.state.jobDescriptions;
    const reports = this.state.reports;
    return [...this.state.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => {
        const jd = s.jobDescriptionId ? jobs.get(s.jobDescriptionId) : null;
        const report = reports.get(s.id);
        return {
          id: s.id,
          jobTitle: jd?.jobTitle ?? "Untitled role",
          companyName: jd?.companyName ?? null,
          interviewType: s.interviewType,
          language: s.language,
          difficulty: s.difficulty,
          durationMinutes: s.durationMinutes,
          persona: s.persona,
          status: s.status,
          avatarProvider: s.avatarProvider,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          createdAt: s.createdAt,
          reportOverallScore: report?.overallScore ?? null,
        };
      });
  }

  async createSession(input: CreateSessionInput): Promise<InterviewSessionRecord> {
    const id = randomUUID();
    const jdId = randomUUID();
    const jd: JobDescriptionRecord = {
      id: jdId,
      userId: input.userId,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      rawDescription: input.rawDescription,
      parsed: input.parsed,
      language: input.language,
      createdAt: nowIso(),
    };
    this.state.jobDescriptions.set(jdId, jd);
    const session: InterviewSessionRecord = {
      id,
      userId: input.userId,
      jobDescriptionId: jdId,
      interviewType: input.interviewType,
      language: input.language,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes,
      persona: input.persona,
      status: "preparing",
      avatarProvider: "demo",
      providerSessionRef: null,
      plan: input.plan,
      engineMemory: null,
      isDemoAnalysis: input.isDemoAnalysis,
      startedAt: null,
      endedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.state.sessions.set(id, session);
    this.state.questions.set(id, []);
    this.state.answers.set(id, []);
    this.state.evaluations.set(id, []);
    this.state.transcripts.set(id, []);
    return session;
  }

  async getSession(userId: string, sessionId: string): Promise<InterviewSessionRecord | null> {
    const s = this.state.sessions.get(sessionId);
    if (!s || s.userId !== userId) return null;
    return s;
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
    const s = await this.getSession(userId, sessionId);
    if (!s) throw new Error("Session not found");
    if (patch.status && !opts?.skipTransitionCheck) {
      assertTransition(s.status, patch.status);
    }
    const updated: InterviewSessionRecord = { ...s, ...patch, updatedAt: nowIso() };
    this.state.sessions.set(sessionId, updated);
    return updated;
  }

  async listQuestions(sessionId: string): Promise<QuestionRecord[]> {
    return [...(this.state.questions.get(sessionId) ?? [])].sort((a, b) =>
      a.sequenceNumber - b.sequenceNumber,
    );
  }

  async replaceQuestions(sessionId: string, questions: QuestionRecord[]): Promise<void> {
    this.state.questions.set(sessionId, questions);
  }

  async addAnswer(input: {
    userId: string;
    sessionId: string;
    questionId: string | null;
    transcript: string;
    source: AnswerSource;
    durationSeconds?: number | null;
  }): Promise<AnswerRecord> {
    const s = await this.getSession(input.userId, input.sessionId);
    if (!s) throw new Error("Session not found");
    const answer: AnswerRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      questionId: input.questionId,
      transcript: input.transcript,
      durationSeconds: input.durationSeconds ?? null,
      source: input.source,
      createdAt: nowIso(),
    };
    this.state.answers.get(input.sessionId)?.push(answer);
    return answer;
  }

  async listAnswers(userId: string, sessionId: string): Promise<AnswerRecord[]> {
    const s = await this.getSession(userId, sessionId);
    if (!s) return [];
    return this.state.answers.get(sessionId) ?? [];
  }

  async addEvaluations(
    userId: string,
    sessionId: string,
    evals: AnswerEvaluation[],
  ): Promise<EvaluationRecord[]> {
    const s = await this.getSession(userId, sessionId);
    if (!s) throw new Error("Session not found");
    const rows: EvaluationRecord[] = evals.map((e) => ({
      id: randomUUID(),
      sessionId,
      questionId: e.questionId,
      overallScore: e.overallScore,
      dimensionScores: e.dimensionScores,
      strengths: e.strengths,
      improvements: e.improvements,
      evidenceExcerpts: e.evidenceExcerpts,
      exampleAnswer: e.exampleAnswer,
      summary: e.summary,
      createdAt: nowIso(),
    }));
    this.state.evaluations.get(sessionId)?.push(...rows);
    return rows;
  }

  async listEvaluations(userId: string, sessionId: string): Promise<EvaluationRecord[]> {
    const s = await this.getSession(userId, sessionId);
    if (!s) return [];
    return this.state.evaluations.get(sessionId) ?? [];
  }

  async saveReport(userId: string, sessionId: string, report: FinalReport): Promise<ReportRecord> {
    const s = await this.getSession(userId, sessionId);
    if (!s) throw new Error("Session not found");
    const row: ReportRecord = {
      id: randomUUID(),
      sessionId,
      summary: report.summary,
      overallScore: report.overallScore,
      competencies: report.competencies,
      learningPlan: report.learningPlan,
      disclaimer: report.disclaimer,
      createdAt: nowIso(),
    };
    this.state.reports.set(sessionId, row);
    return row;
  }

  async getReport(userId: string, sessionId: string): Promise<ReportRecord | null> {
    const s = await this.getSession(userId, sessionId);
    if (!s) return null;
    return this.state.reports.get(sessionId) ?? null;
  }

  async appendTranscript(
    userId: string,
    sessionId: string,
    segments: TranscriptSegment[],
  ): Promise<void> {
    const s = await this.getSession(userId, sessionId);
    if (!s) throw new Error("Session not found");
    const list = this.state.transcripts.get(sessionId) ?? [];
    list.push(...segments);
    this.state.transcripts.set(sessionId, list);
  }

  async listTranscript(userId: string, sessionId: string): Promise<TranscriptSegment[]> {
    const s = await this.getSession(userId, sessionId);
    if (!s) return [];
    return this.state.transcripts.get(sessionId) ?? [];
  }

  async logUsage(
    userId: string,
    eventType: string,
    quantity: number,
  ): Promise<void> {
    this.state.usage.push({ userId, eventType, quantity, at: nowIso() });
  }

  async deleteAllUserData(userId: string): Promise<void> {
    for (const [id, s] of this.state.sessions) {
      if (s.userId === userId) {
        this.state.sessions.delete(id);
        this.state.questions.delete(id);
        this.state.answers.delete(id);
        this.state.evaluations.delete(id);
        this.state.reports.delete(id);
        this.state.transcripts.delete(id);
      }
    }
    for (const [id, jd] of this.state.jobDescriptions) {
      if (jd.userId === userId) this.state.jobDescriptions.delete(id);
    }
    this.state.profiles.delete(userId);
  }
}

export type { SessionStatus };
