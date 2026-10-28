import { describe, expect, it } from "vitest";
import type {
  AnswerRecord,
  InterviewSessionRecord,
  QuestionRecord,
  TranscriptSegment,
} from "@/lib/db/types";
import type { InterviewPlan } from "@/lib/ai/schemas";
import {
  buildEvaluationItems,
  buildTurnRequest,
  compactTranscript,
  conversationObservations,
} from "@/lib/interview/session-service";
import { computeTimeBudget, initialMemory, type EngineContext } from "@/lib/interview/engine";

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const USER_ID = "00000000-0000-4000-8000-000000000001";

function makePlan(): InterviewPlan {
  return {
    roleTitle: "Senior Frontend Engineer",
    seniority: "senior",
    language: "en",
    interviewType: "technical",
    difficulty: "advanced",
    durationMinutes: 20,
    competencies: [
      { id: "c1", name: "Technical depth", kind: "technical", description: "Depth", weight: 0.6 },
      { id: "c2", name: "Communication", kind: "behavioral", description: "Clarity", weight: 0.4 },
    ],
    questions: [
      {
        sequence: 1,
        text: "Tell me about a difficult migration.",
        category: "technical",
        competency: "Technical depth",
        dimensions: ["relevance", "specificity"],
        keyPoints: ["Concrete trade-offs"],
        estimatedSeconds: 120,
      },
      {
        sequence: 2,
        text: "How do you review a risky pull request?",
        category: "technical",
        competency: "Technical depth",
        dimensions: ["relevance", "specificity"],
        keyPoints: ["Checks tests"],
        estimatedSeconds: 120,
      },
      {
        sequence: 3,
        text: "How do you explain a regression to a product manager?",
        category: "behavioral",
        competency: "Communication",
        dimensions: ["communication"],
        keyPoints: ["Plain language"],
        estimatedSeconds: 90,
      },
    ],
    openingRemarks: "Welcome to the practice interview.",
    closingRemarks: "Thanks for practising with me today.",
  };
}

function makeSession(plan: InterviewPlan = makePlan()): InterviewSessionRecord {
  const now = new Date().toISOString();
  return {
    id: SESSION_ID,
    userId: USER_ID,
    jobDescriptionId: null,
    interviewType: "technical",
    language: "en",
    difficulty: "advanced",
    durationMinutes: 20,
    persona: "corporate_interviewer",
    status: "in_progress",
    avatarProvider: "demo",
    providerSessionRef: null,
    plan,
    engineMemory: null,
    isDemoAnalysis: false,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeContext(plan: InterviewPlan = makePlan()): EngineContext {
  return {
    plan,
    budget: computeTimeBudget(plan.durationMinutes),
    memory: {
      ...initialMemory(),
      askedQuestionIds: ["seq:1"],
      currentQuestionId: "seq:1",
      elapsedSeconds: 180,
    },
  };
}

function makeTranscript(): TranscriptSegment[] {
  return [
    { role: "interviewer", text: "Tell me about a difficult migration.", at: "t1" },
    {
      role: "candidate",
      text: "We moved a payments service to a new database over three months.",
      at: "t2",
    },
  ];
}

function makeQuestions(): QuestionRecord[] {
  return makePlan().questions.map((question, index) => ({
    id: `q${index + 1}`,
    sessionId: SESSION_ID,
    sequenceNumber: question.sequence,
    text: question.text,
    category: question.category,
    competency: question.competency,
    keyPoints: question.keyPoints,
    dimensions: question.dimensions,
    createdAt: "t0",
  }));
}

function makeAnswer(
  id: string,
  questionId: string | null,
  transcript: string,
): AnswerRecord {
  return {
    id,
    sessionId: SESSION_ID,
    questionId,
    transcript,
    durationSeconds: null,
    source: "typed",
    createdAt: "t0",
  };
}

describe("buildTurnRequest", () => {
  it("includes role, type, level, current and next question, and the full transcript", () => {
    const session = makeSession();
    const request = buildTurnRequest(session, makeContext(), makeTranscript());

    expect(request.roleTitle).toBe("Senior Frontend Engineer");
    expect(request.persona.name).toBe("Morgan");
    expect(request.persona.title).toMatch(/interviewer/i);
    expect(request.persona.stylePrompt.length).toBeGreaterThan(10);
    expect(request.interviewType).toBe("technical");
    expect(request.difficulty).toBe("advanced");
    expect(request.currentQuestion).toEqual({
      text: "Tell me about a difficult migration.",
      competency: "Technical depth",
      keyPoints: ["Concrete trade-offs"],
    });
    expect(request.nextQuestion).toEqual({
      text: "How do you review a risky pull request?",
      competency: "Technical depth",
    });
    expect(request.askedQuestionTexts).toEqual(["Tell me about a difficult migration."]);
    expect(request.transcript).toEqual([
      { role: "interviewer", text: "Tell me about a difficult migration." },
      {
        role: "candidate",
        text: "We moved a payments service to a new database over three months.",
      },
    ]);
    expect(request.followUpsRemaining).toBeGreaterThan(0);
  });

  it("omits the next question when every planned question was asked", () => {
    const plan = makePlan();
    const ctx = makeContext();
    ctx.memory = {
      ...ctx.memory,
      askedQuestionIds: plan.questions.map((q) => `seq:${q.sequence}`),
    };
    const request = buildTurnRequest(makeSession(plan), ctx, makeTranscript());
    expect(request.nextQuestion).toBeNull();
  });
});

describe("compactTranscript", () => {
  it("keeps the newest turns and truncates over-long segments", () => {
    const segments: TranscriptSegment[] = Array.from({ length: 45 }, (_, i) => ({
      role: i % 2 === 0 ? "interviewer" : "candidate",
      text: i === 44 ? "x".repeat(2_500) : `turn ${i}`,
      at: `t${i}`,
    }));

    const compact = compactTranscript(segments);
    expect(compact).toHaveLength(40);
    expect(compact[0]!.text).toBe("turn 5");
    expect(compact[39]!.text.endsWith("…")).toBe(true);
    expect(compact[39]!.text.length).toBeLessThanOrEqual(2_001);
  });
});

describe("buildEvaluationItems", () => {
  it("groups follow-up answers under the same planned question", () => {
    const questions = makeQuestions();
    const items = buildEvaluationItems("en", questions, [
      makeAnswer("a1", "q1", "First part about the migration."),
      makeAnswer("a2", "q1", "Follow-up detail about the rollback."),
      makeAnswer("a3", "q2", "I review tests and rollback risk."),
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      questionId: "q1",
      answerCount: 2,
      competency: "Technical depth",
    });
    expect(items[0]!.answerTranscript).toContain("First part about the migration.");
    expect(items[0]!.answerTranscript).toContain("Follow-up detail about the rollback.");
    expect(items[1]).toMatchObject({ questionId: "q2", answerCount: 1 });
  });

  it("keeps unmapped answers as a general item instead of dropping them", () => {
    const items = buildEvaluationItems("pt", [], [makeAnswer("a1", null, "Resposta geral.")]);
    expect(items).toHaveLength(1);
    expect(items[0]!.questionId).toBe("");
    expect(items[0]!.questionText).toBe("Resposta geral da entrevista");
  });
});

describe("conversationObservations", () => {
  it("reports only objective transcript counts and lengths", () => {
    const observations = conversationObservations(
      "en",
      [
        makeAnswer("a1", "q1", "one two three four five"),
        makeAnswer("a2", "q2", "one two three"),
      ],
      makeQuestions(),
      1,
    );

    expect(observations).toContain("Answers recorded: 2.");
    expect(observations).toContain("Planned questions answered: 2 of 3.");
    expect(observations).toContain("Follow-up questions asked: 1.");
    expect(observations.join(" ")).toMatch(/no audio, video, or appearance analysis/i);
    expect(observations.join(" ")).not.toMatch(/confident|nervous|accent/i);
  });

  it("localizes observations for Portuguese sessions", () => {
    const observations = conversationObservations("pt", [], makeQuestions(), 0);
    expect(observations[0]).toBe("Respostas registradas: 0.");
    expect(observations.join(" ")).toMatch(/nenhuma análise de áudio/i);
  });
});
