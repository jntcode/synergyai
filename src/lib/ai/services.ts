import "server-only";
import { z, type ZodType } from "zod";
import {
  AIUnavailableError,
  getOpenAI,
  modelFast,
  modelMain,
  withAiLogging,
} from "@/lib/ai/openai-client";
import {
  analyzeJobSystemPrompt,
  analyzeJobUserPrompt,
  evaluationSystemPrompt,
  evaluationUserPrompt,
  nextTurnSystemPrompt,
  nextTurnUserPrompt,
  planSystemPrompt,
  planUserPrompt,
  reportSystemPrompt,
  reportUserPrompt,
} from "@/lib/ai/prompts";
import {
  answerEvaluationSchema,
  finalReportSchema,
  interviewPlanSchema,
  jobAnalysisSchema,
  turnDecisionSchema,
  type AnswerEvaluation,
  type FinalReport,
  type InterviewConfig,
  type InterviewLanguage,
  type InterviewPlan,
  type JobAnalysis,
  type TurnDecision,
} from "@/lib/ai/schemas";

/**
 * Convert a zod schema to an OpenAI strict structured-output JSON schema.
 * Strict mode requires: additionalProperties=false on every object, and every
 * property listed as required (optionals are modeled as nullable instead).
 */
export function toStrictJsonSchema(schema: ZodType, name: string): {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict: boolean;
} {
  const json = z.toJSONSchema(schema, { io: "output", target: "draft-7" }) as Record<
    string,
    unknown
  >;
  const clone = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
  forceStrict(clone);
  return {
    type: "json_schema",
    name,
    schema: clone,
    strict: true,
  };
}

function forceStrict(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
    obj.additionalProperties = false;
    obj.required = Object.keys(obj.properties as Record<string, unknown>);
    for (const value of Object.values(obj.properties as Record<string, unknown>)) {
      forceStrict(value);
    }
  }
  // anyOf (zod unions/nullable) — recurse into branches
  if (Array.isArray(obj.anyOf)) {
    for (const branch of obj.anyOf) forceStrict(branch);
  }
  if (obj.items) forceStrict(obj.items);
}

async function parseStructured<T>(
  op: string,
  model: string,
  system: string,
  user: string,
  schema: ZodType<T>,
  name: string,
  meta?: Record<string, unknown>,
): Promise<T> {
  const openai = getOpenAI();
  return withAiLogging(
    op,
    async () => {
      const response = await openai.responses.create({
        model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: { format: toStrictJsonSchema(schema, name) },
        // Interview content must not be retained by the model provider.
        store: false,
      });
      const raw = response.output_text;
      if (!raw) throw new Error(`Empty structured output from ${op}`);
      const parsed = schema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(
          `Invalid structured output from ${op}: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
        );
      }
      return parsed.data;
    },
    { op, model, ...meta },
  );
}

// ─── Public service functions ────────────────────────────────────────────────

export async function analyzeJobDescription(
  config: InterviewConfig,
): Promise<JobAnalysis> {
  return parseStructured(
    "job.analyze",
    modelFast(),
    analyzeJobSystemPrompt(config.language),
    analyzeJobUserPrompt(config),
    jobAnalysisSchema,
    "job_analysis",
    { language: config.language },
  );
}

export async function generateInterviewPlan(
  config: InterviewConfig,
  analysis: JobAnalysis,
): Promise<InterviewPlan> {
  return parseStructured(
    "interview.plan",
    modelMain(),
    planSystemPrompt(config.language),
    planUserPrompt(config, JSON.stringify(analysis)),
    interviewPlanSchema,
    "interview_plan",
    { language: config.language },
  );
}

export interface NextTurnInput {
  language: InterviewLanguage;
  persona: { name: string; title: string; stylePrompt: string };
  roleTitle: string;
  interviewType: string;
  difficulty: string;
  competencies: { name: string; description: string }[];
  currentQuestion: { text: string; competency: string; keyPoints: string[] } | null;
  nextQuestion: { text: string; competency: string } | null;
  askedQuestionTexts: string[];
  transcript: { role: "interviewer" | "candidate"; text: string }[];
  elapsedSeconds: number;
  remainingSeconds: number;
  followUpsRemaining: number;
}

export async function decideNextTurn(input: NextTurnInput): Promise<TurnDecision> {
  const decision = await parseStructured(
    "interview.turn",
    modelMain(),
    nextTurnSystemPrompt(input.language, input.persona),
    nextTurnUserPrompt(input),
    turnDecisionSchema,
    "turn_decision",
  );
  return decision;
}

export async function evaluateAnswers(input: {
  language: InterviewLanguage;
  roleTitle: string;
  difficulty: string;
  transcriptObservations: string[];
  items: {
    questionId: string;
    questionText: string;
    competency: string;
    dimensions: string[];
    keyPoints: string[];
    answerTranscript: string;
    answerCount: number;
  }[];
}): Promise<AnswerEvaluation[]> {
  // Batched into a single array-output call for cost control.
  const itemSchema = answerEvaluationSchema.omit({ questionId: true }).extend({
    questionId: z.string(),
  });
  const listSchema = z.object({ evaluations: z.array(itemSchema) });
  const result = await parseStructured(
    "interview.evaluate",
    modelFast(),
    evaluationSystemPrompt(input.language),
    evaluationUserPrompt(input),
    listSchema,
    "answer_evaluations",
    { count: input.items.length },
  );
  return result.evaluations.map((e) => answerEvaluationSchema.parse(e));
}

export async function buildFinalReport(input: {
  language: InterviewLanguage;
  roleTitle: string;
  transcriptObservations: string[];
  competencies: { name: string; kind: string }[];
  evaluations: {
    competency: string;
    overallScore: number;
    strengths: string[];
    improvements: string[];
  }[];
}): Promise<FinalReport> {
  return parseStructured(
    "interview.report",
    modelFast(),
    reportSystemPrompt(input.language),
    reportUserPrompt(input),
    finalReportSchema,
    "final_report",
  );
}

export { AIUnavailableError };
