import "server-only";
import { randomUUID } from "node:crypto";
import {
  isOpenAIConfigured,
} from "@/lib/env";
import { logger } from "@/lib/logger";
import type { DataRepo } from "@/lib/db/demo-repo";
import type {
  AnswerRecord,
  AnswerSource,
  InterviewSessionRecord,
  QuestionRecord,
  TranscriptSegment,
} from "@/lib/db/types";
import {
  analyzeJobDescription,
  decideNextTurn,
  evaluateAnswers,
  buildFinalReport,
  generateInterviewPlan,
  type NextTurnInput,
} from "@/lib/ai/services";
import {
  demoAnalyzeJob,
  demoBuildFinalReport,
  demoEvaluateAnswers,
  demoGeneratePlan,
} from "@/lib/ai/demo-fallback";
import {
  applyDecision,
  computeTimeBudget,
  demoProposal,
  initialMemory,
  isTimeUp,
  nextPlannedQuestion,
  openingTurn,
  questionKey,
  reconcileDecision,
  timeRemainingSeconds,
  trackAnswerQuality,
  type EngineContext,
  type EngineMemory,
} from "@/lib/interview/engine";
import { getPersona } from "@/lib/interview/personas";
import type {
  EngineEvent,
  InterviewConfig,
  InterviewPlan,
  TurnDecision,
} from "@/lib/ai/schemas";
import { interviewConfigSchema } from "@/lib/ai/schemas";

export interface CreateInterviewResult {
  session: InterviewSessionRecord;
  analysisMode: "ai" | "demo";
  warnings: string[];
}

/** Analyze JD + generate plan (AI when configured, labeled demo otherwise). */
export async function createInterviewFromConfig(
  repo: DataRepo,
  userId: string,
  rawConfig: unknown,
): Promise<CreateInterviewResult> {
  const config: InterviewConfig = interviewConfigSchema.parse(rawConfig);
  const warnings: string[] = [];
  let analysisMode: CreateInterviewResult["analysisMode"];

  let plan: InterviewPlan;
  let parsed: unknown;
  if (isOpenAIConfigured()) {
    const analysis = await analyzeJobDescription(config);
    plan = await generatePlanGuarded(config, analysis, warnings);
    parsed = analysis;
    analysisMode = "ai";
  } else {
    const analysis = demoAnalyzeJob(config);
    plan = demoGeneratePlan(config, analysis);
    parsed = analysis;
    analysisMode = "demo";
    warnings.push(
      "Demo analysis: OPENAI_API_KEY not configured. The interview plan was generated with rule-based heuristics.",
    );
  }

  const session = await repo.createSession({
    userId,
    jobTitle: config.jobTitle,
    companyName: config.companyName ?? null,
    rawDescription: config.jobDescription,
    language: config.language,
    interviewType: config.interviewType,
    difficulty: config.difficulty,
    durationMinutes: config.durationMinutes,
    persona: config.persona,
    parsed,
    plan,
    isDemoAnalysis: analysisMode === "demo",
  });

  const questions = plan.questions.map((q, i): QuestionRecord => {
    const seq = i + 1;
    return {
      id: randomUUID(),
      sessionId: session.id,
      sequenceNumber: seq,
      text: q.text,
      category: q.category,
      competency: q.competency,
      keyPoints: q.keyPoints,
      dimensions: q.dimensions,
      createdAt: new Date().toISOString(),
    };
  });
  await repo.replaceQuestions(session.id, questions);
  await repo.logUsage(userId, "interview_created", 1, {
    analysisMode,
    durationMinutes: config.durationMinutes,
  });
  return { session, analysisMode, warnings };
}

async function generatePlanGuarded(
  config: InterviewConfig,
  analysis: Parameters<typeof demoGeneratePlan>[1],
  warnings: string[],
): Promise<InterviewPlan> {
  try {
    return await generateInterviewPlan(config, analysis);
  } catch (err) {
    logger.warn("interview.plan_ai_failed_fallback_demo", {
      error: err instanceof Error ? err.message : String(err),
    });
    warnings.push(
      "AI plan generation failed; a demo plan was used instead. Details were logged server-side.",
    );
    return demoGeneratePlan(config, analysis);
  }
}

function buildEngineContext(session: InterviewSessionRecord): EngineContext {
  const plan = session.plan;
  if (!plan) throw new Error("Interview plan is missing from the session record.");
  return {
    plan,
    budget: computeTimeBudget(session.durationMinutes),
    memory: session.engineMemory ?? initialMemory(),
  };
}

function currentQuestionRecord(
  questions: QuestionRecord[],
  memory: { currentQuestionId: string | null },
): QuestionRecord | null {
  if (!memory.currentQuestionId) return null;
  return (
    questions.find((q) => `seq:${q.sequenceNumber}` === memory.currentQuestionId) ?? null
  );
}

export interface TurnResult {
  event: EngineEvent;
  session: InterviewSessionRecord;
  analysisMode: "ai" | "demo";
  /** Which strategy produced this specific turn (AI may fail over to demo). */
  turnMode: "ai" | "demo";
}

export interface PreparedOpeningTurn {
  event: EngineEvent;
  memory: EngineMemory;
}

/**
 * Compute the opening interviewer turn without mutating the session. Live
 * HeyGen mode needs the text before minting the provider session so it can be
 * registered as the context `opening_text` and spoken immediately on connect.
 */
export function prepareOpeningTurn(session: InterviewSessionRecord): PreparedOpeningTurn {
  return openingTurn(buildEngineContext(session));
}

/**
 * Persist a previously prepared opening turn. Separate from preparation so a
 * provider failure leaves the session untouched and safely restartable.
 */
export async function recordOpeningTurn(
  repo: DataRepo,
  session: InterviewSessionRecord,
  prepared: PreparedOpeningTurn,
): Promise<TurnResult> {
  const patch: Partial<
    Pick<InterviewSessionRecord, "status" | "engineMemory" | "startedAt">
  > = {
    engineMemory: prepared.memory,
    startedAt: session.startedAt ?? new Date().toISOString(),
  };
  // The start route transitions ready → connecting before this call. Legacy
  // resumes may already be in_progress; avoid an invalid self-transition.
  if (session.status !== "in_progress") patch.status = "in_progress";
  const updated = await repo.updateSession(session.userId, session.id, patch);
  await repo.appendTranscript(session.userId, session.id, [
    { role: "interviewer", text: prepared.event.text, at: new Date().toISOString() },
  ]);
  return {
    event: prepared.event,
    session: updated,
    analysisMode: session.isDemoAnalysis || !isOpenAIConfigured() ? "demo" : "ai",
    turnMode: "demo",
  };
}

/** Opening interviewer turn — call once when the session becomes in_progress. */
export async function runOpeningTurn(
  repo: DataRepo,
  session: InterviewSessionRecord,
): Promise<TurnResult> {
  return recordOpeningTurn(repo, session, prepareOpeningTurn(session));
}

/**
 * Text to speak when resuming/reconnecting a live session: repeat the question
 * the candidate was last working on. Used as the provider `opening_text` so a
 * reconnected avatar does not sit silent.
 */
export function currentQuestionText(session: InterviewSessionRecord): string | null {
  const plan = session.plan;
  if (!plan) return null;
  const currentId = session.engineMemory?.currentQuestionId;
  const current = currentId
    ? plan.questions.find((question) => questionKey(question) === currentId)
    : null;
  return current?.text ?? plan.questions[0]?.text ?? null;
}

/**
 * Process a candidate answer and produce the next interviewer event.
 * Used by both the text-mode turn API and the optional provider LLM callback.
 * The full persisted transcript is loaded after the answer is appended so the
 * model sees the complete conversation, not just the latest answer.
 */
export async function processCandidateAnswer(
  repo: DataRepo,
  session: InterviewSessionRecord,
  answerText: string,
  source: AnswerSource,
): Promise<TurnResult> {
  const ctx = buildEngineContext(session);
  const questions = await repo.listQuestions(session.id);
  const currentQ = currentQuestionRecord(questions, ctx.memory);
  const trimmed = answerText.trim();

  await repo.addAnswer({
    userId: session.userId,
    sessionId: session.id,
    questionId: currentQ?.id ?? null,
    transcript: trimmed,
    source,
  });
  await repo.appendTranscript(session.userId, session.id, [
    { role: "candidate", text: trimmed, at: new Date().toISOString() },
  ]);

  let memory = trackAnswerQuality(ctx.memory, answerText);
  const now = new Date();
  const elapsed = session.startedAt
    ? Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000)
    : ctx.memory.elapsedSeconds;
  ctx.memory = { ...memory, elapsedSeconds: elapsed };
  memory = ctx.memory;

  const transcript = await repo.listTranscript(session.userId, session.id);
  const proposal = await proposeTurn(ctx, trimmed, transcript, session);
  const decision = reconcileDecision(ctx, proposal.decision);
  const { event, memory: nextMemory } = applyDecision(ctx, decision, currentQ?.id ?? null);

  const isFinish = event.type === "finish_interview";
  const updated = await repo.updateSession(session.userId, session.id, {
    engineMemory: { ...nextMemory, elapsedSeconds: elapsed },
    ...(isFinish
      ? { status: "evaluating" as const, endedAt: now.toISOString() }
      : {}),
  });

  if (!isFinish) {
    await repo.appendTranscript(session.userId, session.id, [
      { role: "interviewer", text: event.text, at: new Date().toISOString() },
    ]);
  }

  return {
    event,
    session: updated,
    analysisMode: session.isDemoAnalysis || !isOpenAIConfigured() ? "demo" : "ai",
    turnMode: proposal.mode,
  };
}

const MODEL_TRANSCRIPT_MAX_TURNS = 40;
const MODEL_TRANSCRIPT_MAX_CHARS = 2000;

/**
 * Trim transcript segments for model input while preserving the most recent
 * conversation. Older turns are dropped only after a generous window so normal
 * interviews keep the full history.
 */
export function compactTranscript(
  segments: TranscriptSegment[],
): { role: "interviewer" | "candidate"; text: string }[] {
  return segments.slice(-MODEL_TRANSCRIPT_MAX_TURNS).map((segment) => ({
    role: segment.role,
    text:
      segment.text.length > MODEL_TRANSCRIPT_MAX_CHARS
        ? `${segment.text.slice(0, MODEL_TRANSCRIPT_MAX_CHARS)}…`
        : segment.text,
  }));
}

/**
 * Build the complete model request for one turn. Exported for tests so the
 * presence of role/type/level, full transcript, current question, and the
 * engine-selected next question can be asserted without calling OpenAI.
 */
export function buildTurnRequest(
  session: InterviewSessionRecord,
  ctx: EngineContext,
  transcript: TranscriptSegment[],
): NextTurnInput {
  const questions = ctx.plan.questions;
  const persona = getPersona(session.persona);
  const currentSeq = ctx.memory.currentQuestionId
    ? Number(ctx.memory.currentQuestionId.replace("seq:", ""))
    : null;
  const current = questions.find((q) => q.sequence === currentSeq) ?? null;
  const next = nextPlannedQuestion(ctx.plan, ctx.memory, ctx.budget);
  const askedTexts = ctx.memory.askedQuestionIds
    .map((k) => questions.find((q) => questionKey(q) === k)?.text)
    .filter((t): t is string => Boolean(t));

  return {
    language: ctx.plan.language,
    persona: {
      name: persona.name,
      title: persona.title,
      stylePrompt: persona.stylePrompt,
    },
    roleTitle: ctx.plan.roleTitle,
    interviewType: session.interviewType,
    difficulty: session.difficulty,
    competencies: ctx.plan.competencies.map((c) => ({
      name: c.name,
      description: c.description,
    })),
    currentQuestion: current
      ? { text: current.text, competency: current.competency, keyPoints: current.keyPoints }
      : null,
    nextQuestion: next ? { text: next.text, competency: next.competency } : null,
    askedQuestionTexts: askedTexts,
    transcript: compactTranscript(transcript),
    elapsedSeconds: ctx.memory.elapsedSeconds,
    remainingSeconds: timeRemainingSeconds(ctx),
    followUpsRemaining: Math.max(
      0,
      ctx.budget.maxFollowUps - ctx.memory.followUpsAsked,
    ),
  };
}

async function proposeTurn(
  ctx: EngineContext,
  lastAnswer: string,
  transcript: TranscriptSegment[],
  session: InterviewSessionRecord,
): Promise<{ decision: TurnDecision; mode: "ai" | "demo" }> {
  if (!isOpenAIConfigured()) {
    return { decision: demoProposal(ctx, lastAnswer), mode: "demo" };
  }
  try {
    const decision = await decideNextTurn(buildTurnRequest(session, ctx, transcript));
    return { decision, mode: "ai" };
  } catch (err) {
    logger.warn("interview.turn_ai_failed_fallback_demo", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { decision: demoProposal(ctx, lastAnswer), mode: "demo" };
  }
}

export interface EvaluationItem {
  questionId: string;
  questionText: string;
  competency: string;
  dimensions: string[];
  keyPoints: string[];
  answerTranscript: string;
  answerCount: number;
}

/**
 * Group multiple candidate answers to the same planned question into one
 * evaluation item. Follow-up answers are part of the same competency, so
 * evaluating them separately would double-count the question and hide the
 * back-and-forth from the report.
 */
export function buildEvaluationItems(
  language: InterviewSessionRecord["language"],
  questions: QuestionRecord[],
  answers: AnswerRecord[],
): EvaluationItem[] {
  const byQuestion = new Map<string, EvaluationItem & { parts: string[] }>();
  for (const answer of answers) {
    const text = answer.transcript.trim();
    if (!text) continue;
    const question = answer.questionId
      ? questions.find((q) => q.id === answer.questionId) ?? null
      : null;
    const key = question?.id ?? "unmapped";
    const existing = byQuestion.get(key);
    if (existing) {
      existing.parts.push(text);
      existing.answerCount += 1;
      continue;
    }
    byQuestion.set(key, {
      questionId: question?.id ?? "",
      questionText:
        question?.text ??
        (language === "pt" ? "Resposta geral da entrevista" : "General interview response"),
      competency: question?.competency ?? "general",
      dimensions: question?.dimensions ?? [],
      keyPoints: question?.keyPoints ?? [],
      answerTranscript: text,
      answerCount: 1,
      parts: [text],
    });
  }
  return [...byQuestion.values()].map(({ parts, ...item }) => ({
    ...item,
    answerTranscript: parts.join("\n\n---\n\n"),
    answerCount: parts.length,
  }));
}

/** Objective, transcript-only observations; never inferred traits or scores. */
export function conversationObservations(
  language: InterviewSessionRecord["language"],
  answers: AnswerRecord[],
  questions: QuestionRecord[],
  followUpsAsked: number,
): string[] {
  const nonEmpty = answers.map((a) => a.transcript.trim()).filter(Boolean);
  const lengths = nonEmpty.map((text) => text.split(/\s+/).filter(Boolean).length);
  const answeredQuestions = new Set(
    answers.map((a) => a.questionId).filter((id): id is string => Boolean(id)),
  );
  const avg =
    lengths.length === 0 ? 0 : Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const isPt = language === "pt";
  return [
    isPt
      ? `Respostas registradas: ${nonEmpty.length}.`
      : `Answers recorded: ${nonEmpty.length}.`,
    isPt
      ? `Perguntas do plano respondidas: ${answeredQuestions.size} de ${questions.length}.`
      : `Planned questions answered: ${answeredQuestions.size} of ${questions.length}.`,
    isPt
      ? `Comprimento médio das respostas: ${avg} palavras (mínimo ${lengths.length ? Math.min(...lengths) : 0}, máximo ${lengths.length ? Math.max(...lengths) : 0}).`
      : `Average answer length: ${avg} words (min ${lengths.length ? Math.min(...lengths) : 0}, max ${lengths.length ? Math.max(...lengths) : 0}).`,
    isPt
      ? `Perguntas de acompanhamento feitas: ${followUpsAsked}.`
      : `Follow-up questions asked: ${followUpsAsked}.`,
    isPt
      ? "Observações apenas do texto transcrito; nenhuma análise de áudio, vídeo ou aparência."
      : "Transcript-only observations; no audio, video, or appearance analysis.",
  ];
}

export interface FinishResult {
  status: "completed";
  reportId: string;
  analysisMode: "ai" | "demo";
}

/**
 * Evaluate all answers and persist the final report. Idempotent: if a report
 * already exists it is returned as-is (prevents duplicate generation costs).
 */
export async function finishInterview(
  repo: DataRepo,
  session: InterviewSessionRecord,
): Promise<FinishResult> {
  const existing = await repo.getReport(session.userId, session.id);
  if (existing && session.status === "completed") {
    return {
      status: "completed",
      reportId: existing.id,
      analysisMode: session.isDemoAnalysis ? "demo" : "ai",
    };
  }

  const questions = await repo.listQuestions(session.id);
  const answers = await repo.listAnswers(session.userId, session.id);
  const plan = session.plan;
  if (!plan) throw new Error("Cannot finish an interview without a plan.");

  // Group answers by planned question so a follow-up and its original answer
  // are evaluated together instead of as unrelated questions.
  const items = buildEvaluationItems(session.language, questions, answers);
  const observations = conversationObservations(
    session.language,
    answers,
    questions,
    session.engineMemory?.followUpsAsked ?? 0,
  );

  const useAi = isOpenAIConfigured() && !session.isDemoAnalysis;
  let analysisMode: FinishResult["analysisMode"] = useAi ? "ai" : "demo";

  if (items.length === 0) {
    // No answers — produce an honest empty report without calling AI.
    const empty = demoBuildFinalReport({
      language: session.language,
      evaluations: [],
      competencies: plan.competencies,
    });
    const report = await repo.saveReport(session.userId, session.id, {
      ...empty,
      summary:
        session.language === "pt"
          ? "Nenhuma resposta foi registrada nesta sessão."
          : "No answers were recorded in this session.",
    });
    if (session.status !== "completed") {
      await repo.updateSession(session.userId, session.id, {
        status: "completed",
        endedAt: session.endedAt ?? new Date().toISOString(),
      });
    }
    return { status: "completed", reportId: report.id, analysisMode: "demo" };
  }

  let reportBody;
  let evaluations;
  if (useAi) {
    evaluations = await evaluateAnswers({
      language: session.language,
      roleTitle: plan.roleTitle,
      difficulty: session.difficulty,
      transcriptObservations: observations,
      items,
    });
    // Attach competency names for the report step.
    reportBody = await buildFinalReport({
      language: session.language,
      roleTitle: plan.roleTitle,
      transcriptObservations: observations,
      competencies: plan.competencies.map((c) => ({ name: c.name, kind: c.kind })),
      evaluations: evaluations.map((e, i) => ({
        competency: items[i]?.competency ?? "general",
        overallScore: e.overallScore,
        strengths: e.strengths,
        improvements: e.improvements,
      })),
    });
  } else {
    analysisMode = "demo";
    evaluations = demoEvaluateAnswers({
      language: session.language,
      items: items.map((i) => ({
        questionId: i.questionId,
        competency: i.competency,
        answerTranscript: i.answerTranscript,
        keyPoints: i.keyPoints,
      })),
    });
    reportBody = demoBuildFinalReport({
      language: session.language,
      evaluations,
      competencies: plan.competencies.map((c) => ({ name: c.name })),
    });
  }

  await repo.addEvaluations(session.userId, session.id, evaluations);
  const report = await repo.saveReport(session.userId, session.id, reportBody);

  if (session.status === "in_progress" || session.status === "evaluating") {
    await repo.updateSession(session.userId, session.id, {
      status: "completed",
      endedAt: session.endedAt ?? new Date().toISOString(),
    });
  }
  await repo.logUsage(session.userId, "interview_finished", 1, { analysisMode });
  return { status: "completed", reportId: report.id, analysisMode };
}

export { getPersona, isTimeUp, nextPlannedQuestion };
