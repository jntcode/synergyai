import type {
  EngineEvent,
  InterviewPlan,
  PlannedQuestion,
  TurnAction,
  TurnDecision,
} from "@/lib/ai/schemas";

export interface TimeBudget {
  totalSeconds: number;
  /** Planned (non-follow-up) questions the interview should fit. */
  plannedQuestionCount: number;
  /** Max follow-up questions across the whole interview. */
  maxFollowUps: number;
}

export function computeTimeBudget(durationMinutes: number): TimeBudget {
  const totalSeconds = durationMinutes * 60;
  // ~2.5 minutes per planned question including listening + follow-ups.
  const plannedQuestionCount = Math.max(3, Math.min(10, Math.round(totalSeconds / 150)));
  const maxFollowUps = Math.max(1, Math.round(plannedQuestionCount / 2));
  return { totalSeconds, plannedQuestionCount, maxFollowUps };
}

/** Question count actually present in a concrete plan (never below budget cap). */
export function effectivePlannedCount(plan: InterviewPlan, budget: TimeBudget): number {
  return Math.min(plan.questions.length, budget.plannedQuestionCount);
}

export interface EngineMemory {
  /** Ids of planned questions already asked, in order. */
  askedQuestionIds: string[];
  /** Number of follow-ups asked so far. */
  followUpsAsked: number;
  /** Question currently being answered (last asked planned question id). */
  currentQuestionId: string | null;
  /** Follow-ups already asked for the current question. */
  followUpsForCurrentQuestion: number;
  /** Consecutive short/empty answers (to avoid looping). */
  weakAnswerStreak: number;
  /** Seconds elapsed since session start. */
  elapsedSeconds: number;
}

export interface EngineContext {
  plan: InterviewPlan;
  budget: TimeBudget;
  memory: EngineMemory;
}

export function initialMemory(): EngineMemory {
  return {
    askedQuestionIds: [],
    followUpsAsked: 0,
    currentQuestionId: null,
    followUpsForCurrentQuestion: 0,
    weakAnswerStreak: 0,
    elapsedSeconds: 0,
  };
}

export function nextPlannedQuestion(
  plan: InterviewPlan,
  memory: EngineMemory,
  budget: TimeBudget,
): PlannedQuestion | null {
  const limit = effectivePlannedCount(plan, budget);
  const planned = plan.questions
    .filter((q) => q.sequence <= limit)
    .sort((a, b) => a.sequence - b.sequence);
  for (const q of planned) {
    if (!memory.askedQuestionIds.includes(questionKey(q))) return q;
  }
  return null;
}

export function questionKey(q: PlannedQuestion): string {
  return `seq:${q.sequence}`;
}

export function timeRemainingSeconds(ctx: EngineContext): number {
  return Math.max(0, ctx.budget.totalSeconds - ctx.memory.elapsedSeconds);
}

/** True when there is not enough time to meaningfully ask another question. */
export function isTimeUp(ctx: EngineContext, graceSeconds = 45): boolean {
  return timeRemainingSeconds(ctx) < graceSeconds;
}

/**
 * Merge an LLM (or demo) proposed decision with hard engine rules.
 * The engine always wins on budgets, repeats, and time.
 */
export function reconcileDecision(
  ctx: EngineContext,
  proposal: TurnDecision,
): TurnDecision {
  const remaining = nextPlannedQuestion(ctx.plan, ctx.memory, ctx.budget);
  const noTime = isTimeUp(ctx);
  const followUpExhausted =
    ctx.memory.followUpsAsked >= ctx.budget.maxFollowUps ||
    ctx.memory.followUpsForCurrentQuestion >= 1 ||
    ctx.memory.weakAnswerStreak >= 2;

  if (noTime || (!remaining && proposal.action !== "finish")) {
    return {
      action: "finish",
      spokenText: ctx.plan.closingRemarks,
      followUpText: null,
      notes: "engine: time/budget exhausted",
    };
  }

  switch (proposal.action) {
    case "finish":
      return proposal;
    case "follow_up": {
      if (followUpExhausted || !proposal.followUpText) {
        if (!remaining) {
          return {
            action: "finish",
            spokenText: ctx.plan.closingRemarks,
            followUpText: null,
            notes: "engine: follow-up denied, no questions left",
          };
        }
        return {
          action: "next_question",
          spokenText: remaining.text,
          followUpText: null,
          notes: "engine: follow-up denied by budget",
        };
      }
      return {
        ...proposal,
        spokenText: proposal.followUpText,
        followUpText: proposal.followUpText,
      };
    }
    case "next_question":
    case "clarify":
      return remaining
        ? proposal
        : {
            action: "finish",
            spokenText: ctx.plan.closingRemarks,
            followUpText: null,
            notes: "engine: no questions left",
          };
    case "acknowledge": {
      if (!remaining) {
        return {
          action: "finish",
          spokenText: ctx.plan.closingRemarks,
          followUpText: null,
          notes: "engine: acknowledged final answer",
        };
      }
      // An acknowledgement alone would leave the candidate without a prompt.
      // Keep the model's reaction, then ask the next planned question.
      const reaction = proposal.spokenText.trim();
      return {
        ...proposal,
        action: "next_question",
        spokenText: reaction.includes("?") ? reaction : `${reaction} ${remaining.text}`.trim(),
        followUpText: null,
        notes: proposal.notes ?? "engine: acknowledgement followed by next question",
      };
    }
  }
}

/** Apply a reconciled decision to memory. Returns the persisted engine event. */
export function applyDecision(
  ctx: EngineContext,
  decision: TurnDecision,
  currentQuestionDbId: string | null,
): { event: EngineEvent; memory: EngineMemory } {
  const memory: EngineMemory = { ...ctx.memory };
  const remaining = nextPlannedQuestion(ctx.plan, memory, ctx.budget);

  let event: EngineEvent;
  switch (decision.action) {
    case "acknowledge":
      event = { type: "acknowledge_answer", text: decision.spokenText };
      break;
    case "clarify":
      event = { type: "clarify", text: decision.spokenText };
      break;
    case "follow_up":
      memory.followUpsAsked += 1;
      memory.followUpsForCurrentQuestion += 1;
      event = {
        type: "ask_follow_up",
        text: decision.spokenText,
        competency: currentQuestionDbId
          ? ctx.plan.questions.find((q) => q.competency)?.competency
          : undefined,
      };
      break;
    case "next_question":
      if (!remaining) {
        event = { type: "finish_interview", text: ctx.plan.closingRemarks };
        break;
      }
      memory.askedQuestionIds = [...memory.askedQuestionIds, questionKey(remaining)];
      memory.currentQuestionId = questionKey(remaining);
      memory.followUpsForCurrentQuestion = 0;
      event = {
        type: "ask_question",
        // The model's line acknowledges the previous answer and asks this
        // planned question in context. Fall back to the plan text only when the
        // model returned no usable line.
        text: decision.spokenText.trim() || remaining.text,
        competency: remaining.competency,
      };
      break;
    case "finish":
      event = { type: "finish_interview", text: ctx.plan.closingRemarks };
      break;
  }

  return { event, memory };
}

/** Opening turn: brief intro + readiness + first question. */
export function openingTurn(ctx: EngineContext): {
  event: EngineEvent;
  memory: EngineMemory;
} {
  const first = nextPlannedQuestion(ctx.plan, initialMemory(), ctx.budget) ?? ctx.plan.questions[0]!;
  const memory: EngineMemory = {
    ...initialMemory(),
    askedQuestionIds: [questionKey(first)],
    currentQuestionId: questionKey(first),
  };
  const text = `${ctx.plan.openingRemarks} ${first.text}`.trim();
  return {
    event: { type: "ask_question", text, competency: first.competency },
    memory,
  };
}

/** Heuristic used in demo mode (no OpenAI) — clearly labeled in the UI. */
export function demoProposal(
  ctx: EngineContext,
  lastAnswer: string | null,
): TurnDecision {
  const remaining = nextPlannedQuestion(ctx.plan, ctx.memory, ctx.budget);
  if (isTimeUp(ctx) || !remaining) {
    return {
      action: "finish",
      spokenText: ctx.plan.closingRemarks,
      followUpText: null,
      notes: "demo: finished",
    };
  }
  const words = (lastAnswer ?? "").trim().split(/\s+/).filter(Boolean).length;
  // One demo follow-up for very short answers on the first pass.
  if (lastAnswer !== null && words < 12 && ctx.memory.followUpsForCurrentQuestion === 0) {
    const followUp =
      ctx.plan.language === "pt"
        ? "Pode dar um pouco mais de detalhe — por exemplo, o que você fez especificamente e qual foi o resultado?"
        : "Could you add a bit more detail — for example, what you did specifically and what the result was?";
    return {
      action: "follow_up",
      spokenText: followUp,
      followUpText: followUp,
      notes: "demo: short-answer follow-up",
    };
  }
  return {
    action: "next_question",
    spokenText: remaining.text,
    followUpText: null,
    notes: "demo: next planned question",
  };
}

export function trackAnswerQuality(memory: EngineMemory, answer: string): EngineMemory {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const weak = words < 10;
  return {
    ...memory,
    weakAnswerStreak: weak ? memory.weakAnswerStreak + 1 : 0,
  };
}

export type { TurnAction };
