import { describe, expect, it } from "vitest";
import type { InterviewPlan } from "@/lib/ai/schemas";
import {
  applyDecision,
  computeTimeBudget,
  demoProposal,
  effectivePlannedCount,
  initialMemory,
  isTimeUp,
  nextPlannedQuestion,
  openingTurn,
  reconcileDecision,
  trackAnswerQuality,
  type EngineContext,
  type EngineMemory,
} from "@/lib/interview/engine";

function makePlan(questionCount = 4): InterviewPlan {
  return {
    roleTitle: "Frontend Engineer",
    seniority: "mid",
    language: "en",
    interviewType: "mixed",
    difficulty: "intermediate",
    durationMinutes: 20,
    competencies: [
      { id: "c1", name: "Technical", kind: "technical", description: "", weight: 0.5 },
      { id: "c2", name: "Communication", kind: "behavioral", description: "", weight: 0.5 },
    ],
    questions: Array.from({ length: questionCount }, (_, i) => ({
      sequence: i + 1,
      text: `Question number ${i + 1}?`,
      category: "behavioral" as const,
      competency: "Communication",
      dimensions: ["relevance" as const, "communication" as const],
      keyPoints: [],
      estimatedSeconds: 120,
    })),
    openingRemarks: "Hello and welcome to this practice interview session.",
    closingRemarks: "Thank you — that concludes our practice interview today.",
  };
}

function makeCtx(overrides?: {
  plan?: InterviewPlan;
  memory?: Partial<EngineMemory>;
  minutes?: number;
}): EngineContext {
  const plan = overrides?.plan ?? makePlan();
  const budget = computeTimeBudget(overrides?.minutes ?? plan.durationMinutes);
  const memory = { ...initialMemory(), ...overrides?.memory };
  return { plan, budget, memory };
}

describe("computeTimeBudget", () => {
  it("scales question count with duration", () => {
    expect(computeTimeBudget(10).plannedQuestionCount).toBeLessThanOrEqual(4);
    expect(computeTimeBudget(30).plannedQuestionCount).toBeGreaterThan(
      computeTimeBudget(10).plannedQuestionCount,
    );
  });

  it("keeps counts within bounds", () => {
    for (const m of [5, 10, 20, 30, 120]) {
      const b = computeTimeBudget(m);
      expect(b.plannedQuestionCount).toBeGreaterThanOrEqual(3);
      expect(b.plannedQuestionCount).toBeLessThanOrEqual(10);
      expect(b.maxFollowUps).toBeGreaterThanOrEqual(1);
      expect(b.totalSeconds).toBe(m * 60);
    }
  });
});

describe("effectivePlannedCount", () => {
  it("caps by both plan length and budget", () => {
    const budget = computeTimeBudget(20);
    expect(effectivePlannedCount(makePlan(10), budget)).toBe(budget.plannedQuestionCount);
    expect(effectivePlannedCount(makePlan(2), budget)).toBe(2);
  });
});

describe("nextPlannedQuestion", () => {
  it("returns the first unanswered planned question in order", () => {
    const ctx = makeCtx();
    const first = nextPlannedQuestion(ctx.plan, ctx.memory, ctx.budget);
    expect(first?.sequence).toBe(1);
  });

  it("skips already-asked questions", () => {
    const ctx = makeCtx({ memory: { askedQuestionIds: ["seq:1", "seq:2"] } });
    const next = nextPlannedQuestion(ctx.plan, ctx.memory, ctx.budget);
    expect(next?.sequence).toBe(3);
  });

  it("returns null when all planned questions are asked", () => {
    const plan = makePlan(2);
    const budget = computeTimeBudget(20); // budget ≥ 2
    const memory: EngineMemory = { ...initialMemory(), askedQuestionIds: ["seq:1", "seq:2"] };
    expect(nextPlannedQuestion(plan, memory, budget)).toBeNull();
  });
});

describe("isTimeUp", () => {
  it("is false early and true near the end", () => {
    const early = makeCtx();
    expect(isTimeUp(early)).toBe(false);
    const late = makeCtx({ memory: { elapsedSeconds: 20 * 60 - 30 } });
    expect(isTimeUp(late)).toBe(true);
  });
});

describe("openingTurn", () => {
  it("asks the first question and marks it asked", () => {
    const ctx = makeCtx();
    const { event, memory } = openingTurn(ctx);
    expect(event.type).toBe("ask_question");
    expect(event.text).toContain("Question number 1?");
    expect(memory.askedQuestionIds).toEqual(["seq:1"]);
    expect(memory.currentQuestionId).toBe("seq:1");
  });
});

describe("reconcileDecision", () => {
  it("forces finish when time is up", () => {
    const ctx = makeCtx({ memory: { elapsedSeconds: 20 * 60 - 10 } });
    const out = reconcileDecision(ctx, {
      action: "next_question",
      spokenText: "Next?",
      followUpText: null,
      notes: null,
    });
    expect(out.action).toBe("finish");
    expect(out.spokenText).toBe(ctx.plan.closingRemarks);
  });

  it("turns an acknowledgement into the next question so the candidate is prompted", () => {
    const ctx = makeCtx();
    const out = reconcileDecision(ctx, {
      action: "acknowledge",
      spokenText: "That sounds like a strong result.",
      followUpText: null,
      notes: null,
    });
    expect(out.action).toBe("next_question");
    expect(out.spokenText).toContain("That sounds like a strong result.");
    expect(out.spokenText).toContain("Question number 1?");
    expect(out.followUpText).toBeNull();
  });

  it("does not append a second question when the acknowledgement already asks one", () => {
    const ctx = makeCtx();
    const out = reconcileDecision(ctx, {
      action: "acknowledge",
      spokenText: "That sounds strong — can you tell me what changed?",
      followUpText: null,
      notes: null,
    });
    expect(out.action).toBe("next_question");
    expect(out.spokenText).toBe("That sounds strong — can you tell me what changed?");
  });

  it("forces finish when no planned questions remain", () => {
    const ctx = makeCtx({
      plan: makePlan(2),
      memory: { askedQuestionIds: ["seq:1", "seq:2"], currentQuestionId: "seq:2" },
    });
    const out = reconcileDecision(ctx, {
      action: "acknowledge",
      spokenText: "Okay.",
      followUpText: null,
      notes: null,
    });
    expect(out.action).toBe("finish");
  });

  it("denies a follow-up when the budget is exhausted", () => {
    const ctx = makeCtx({ memory: { followUpsAsked: 2, followUpsForCurrentQuestion: 1 } });
    const out = reconcileDecision(ctx, {
      action: "follow_up",
      spokenText: "ignored",
      followUpText: "Can you say more?",
      notes: null,
    });
    expect(out.action).toBe("next_question");
    expect(out.spokenText).toContain("Question number");
  });

  it("denies a second follow-up for the same question", () => {
    const ctx = makeCtx({ memory: { followUpsForCurrentQuestion: 1 } });
    const out = reconcileDecision(ctx, {
      action: "follow_up",
      spokenText: "ignored",
      followUpText: "More detail?",
      notes: null,
    });
    expect(out.action).toBe("next_question");
  });

  it("denies follow-ups after two consecutive weak answers", () => {
    const ctx = makeCtx({ memory: { weakAnswerStreak: 2 } });
    const out = reconcileDecision(ctx, {
      action: "follow_up",
      spokenText: "ignored",
      followUpText: "More detail?",
      notes: null,
    });
    expect(out.action).toBe("next_question");
  });

  it("allows a budgeted follow-up", () => {
    const ctx = makeCtx();
    const out = reconcileDecision(ctx, {
      action: "follow_up",
      spokenText: "wrong text",
      followUpText: "What was the result?",
      notes: null,
    });
    expect(out.action).toBe("follow_up");
    expect(out.spokenText).toBe("What was the result?");
  });

  it("passes an explicit finish through", () => {
    const ctx = makeCtx();
    const proposal = {
      action: "finish" as const,
      spokenText: "We are done early.",
      followUpText: null,
      notes: null,
    };
    expect(reconcileDecision(ctx, proposal)).toEqual(proposal);
  });
});

describe("applyDecision", () => {
  it("next_question advances memory and emits the contextual spoken line", () => {
    const ctx = makeCtx();
    const { event, memory } = applyDecision(
      ctx,
      {
        action: "next_question",
        spokenText: "Nice detail. Question number 1?",
        followUpText: null,
        notes: null,
      },
      null,
    );
    expect(event.type).toBe("ask_question");
    expect(event.text).toBe("Nice detail. Question number 1?");
    expect(memory.askedQuestionIds).toEqual(["seq:1"]);
  });

  it("falls back to the planned question when the model returns blank text", () => {
    const ctx = makeCtx();
    const { event } = applyDecision(
      ctx,
      { action: "next_question", spokenText: " ", followUpText: null, notes: null },
      null,
    );
    expect(event.text).toBe("Question number 1?");
  });

  it("follow_up increments follow-up counters", () => {
    const ctx = makeCtx({ memory: { currentQuestionId: "seq:1" } });
    const { event, memory } = applyDecision(
      ctx,
      { action: "follow_up", spokenText: "More?", followUpText: null, notes: null },
      "db-q-1",
    );
    expect(event.type).toBe("ask_follow_up");
    expect(memory.followUpsAsked).toBe(1);
    expect(memory.followUpsForCurrentQuestion).toBe(1);
  });

  it("acknowledge and clarify do not advance the question", () => {
    const ctx = makeCtx();
    const ack = applyDecision(
      ctx,
      { action: "acknowledge", spokenText: "Thanks.", followUpText: null, notes: null },
      null,
    );
    expect(ack.event.type).toBe("acknowledge_answer");
    expect(ack.memory.askedQuestionIds).toEqual([]);

    const clarify = applyDecision(
      ctx,
      { action: "clarify", spokenText: "Could you clarify?", followUpText: null, notes: null },
      null,
    );
    expect(clarify.event.type).toBe("clarify");
    expect(clarify.memory.askedQuestionIds).toEqual([]);
  });

  it("finish emits finish_interview with closing remarks", () => {
    const ctx = makeCtx();
    const { event } = applyDecision(
      ctx,
      { action: "finish", spokenText: "ignored", followUpText: null, notes: null },
      null,
    );
    expect(event.type).toBe("finish_interview");
    expect(event.text).toBe(ctx.plan.closingRemarks);
  });

  it("next_question with no remaining questions finishes", () => {
    const ctx = makeCtx({
      plan: makePlan(1),
      memory: { askedQuestionIds: ["seq:1"], currentQuestionId: "seq:1" },
    });
    const { event } = applyDecision(
      ctx,
      { action: "next_question", spokenText: "Q?", followUpText: null, notes: null },
      null,
    );
    expect(event.type).toBe("finish_interview");
  });
});

describe("demoProposal", () => {
  it("finishes when no questions remain", () => {
    const ctx = makeCtx({
      plan: makePlan(1),
      memory: { askedQuestionIds: ["seq:1"], currentQuestionId: "seq:1" },
    });
    const p = demoProposal(ctx, "some answer");
    expect(p.action).toBe("finish");
  });

  it("proposes a follow-up for a very short answer", () => {
    const ctx = makeCtx({ memory: { currentQuestionId: "seq:1" } });
    const p = demoProposal(ctx, "It was fine I guess");
    expect(p.action).toBe("follow_up");
    expect(p.followUpText).toBeTruthy();
  });

  it("moves to the next question for a solid answer", () => {
    const ctx = makeCtx({ memory: { currentQuestionId: "seq:1" } });
    const long =
      "I led a redesign of the checkout flow, coordinated with design and backend, " +
      "and reduced cart abandonment by twelve percent in the first quarter after launch.";
    const p = demoProposal(ctx, long);
    expect(p.action).toBe("next_question");
  });

  it("does not follow up twice for the same question", () => {
    const ctx = makeCtx({
      memory: { currentQuestionId: "seq:1", followUpsForCurrentQuestion: 1 },
    });
    const p = demoProposal(ctx, "short");
    expect(p.action).toBe("next_question");
  });
});

describe("trackAnswerQuality", () => {
  it("increments the weak streak for short answers", () => {
    let m = trackAnswerQuality(initialMemory(), "yes");
    expect(m.weakAnswerStreak).toBe(1);
    m = trackAnswerQuality(m, "no");
    expect(m.weakAnswerStreak).toBe(2);
  });

  it("resets the streak on a substantive answer", () => {
    const m = trackAnswerQuality(
      { ...initialMemory(), weakAnswerStreak: 2 },
      "I built a multi-tenant billing service handling subscriptions for four regions.",
    );
    expect(m.weakAnswerStreak).toBe(0);
  });
});
