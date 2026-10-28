import { z } from "zod";

/** Supported interview languages. Architecture allows adding more. */
export const interviewLanguageSchema = z.enum(["en", "pt"]);
export type InterviewLanguage = z.infer<typeof interviewLanguageSchema>;

export const LANGUAGE_LABELS: Record<InterviewLanguage, string> = {
  en: "English",
  pt: "Portuguese (Brazil)",
};

export const interviewTypeSchema = z.enum([
  "behavioral",
  "technical",
  "hr_screening",
  "case_study",
  "role_specific",
  "mixed",
]);
export type InterviewType = z.infer<typeof interviewTypeSchema>;

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  hr_screening: "HR screening",
  case_study: "Case study",
  role_specific: "Role-specific",
  mixed: "Mixed interview",
};

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const durationSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
]);
export type DurationMinutes = z.infer<typeof durationSchema>;

export const interviewerPersonaIdSchema = z.enum([
  "friendly_recruiter",
  "corporate_interviewer",
  "technical_challenger",
  "senior_hiring_manager",
]);
export type InterviewerPersonaId = z.infer<typeof interviewerPersonaIdSchema>;

// ─── Job description analysis ─────────────────────────────────────────────────

export const senioritySchema = z.enum([
  "intern",
  "entry",
  "mid",
  "senior",
  "lead",
  "unknown",
]);
export type Seniority = z.infer<typeof senioritySchema>;

export const jobAnalysisSchema = z.object({
  normalizedRoleTitle: z.string().min(1),
  seniority: senioritySchema,
  responsibilities: z.array(z.string()).min(1),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  technicalCompetencies: z.array(z.string()),
  behavioralCompetencies: z.array(z.string()),
  themes: z.array(z.string()),
  questionDistribution: z.object({
    behavioral: z.number().int().min(0),
    technical: z.number().int().min(0),
    roleSpecific: z.number().int().min(0),
    hrScreening: z.number().int().min(0),
    caseStudy: z.number().int().min(0),
  }),
  evaluationCriteria: z.array(z.string()),
  uncertainties: z.array(z.string()),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

// ─── Interview plan ───────────────────────────────────────────────────────────

export const evaluationDimensionSchema = z.enum([
  "relevance",
  "accuracy",
  "specificity",
  "reasoning",
  "evidence",
  "communication",
]);
export type EvaluationDimension = z.infer<typeof evaluationDimensionSchema>;

export const DIMENSION_LABELS: Record<EvaluationDimension, string> = {
  relevance: "Relevance to the question",
  accuracy: "Accuracy of content",
  specificity: "Specificity & clarity",
  reasoning: "Reasoning & problem-solving",
  evidence: "Evidence supporting claims",
  communication: "Communication structure",
};

export const plannedQuestionSchema = z.object({
  sequence: z.number().int().min(1),
  text: z.string().min(5),
  category: z.enum([
    "behavioral",
    "technical",
    "role_specific",
    "hr_screening",
    "case_study",
  ]),
  competency: z.string().min(1),
  dimensions: z.array(evaluationDimensionSchema).min(1),
  keyPoints: z.array(z.string()),
  estimatedSeconds: z.number().int().min(20).max(600),
});
export type PlannedQuestion = z.infer<typeof plannedQuestionSchema>;

export const interviewPlanSchema = z.object({
  roleTitle: z.string().min(1),
  seniority: senioritySchema,
  language: interviewLanguageSchema,
  interviewType: interviewTypeSchema,
  difficulty: difficultySchema,
  durationMinutes: durationSchema,
  competencies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        kind: z.enum(["technical", "behavioral", "role_specific"]),
        description: z.string(),
        weight: z.number().min(0).max(1),
      }),
    )
    .min(2),
  questions: z.array(plannedQuestionSchema).min(2),
  openingRemarks: z.string().min(10),
  closingRemarks: z.string().min(10),
});
export type InterviewPlan = z.infer<typeof interviewPlanSchema>;

// ─── Engine events (internal, validated) ─────────────────────────────────────

export const engineEventTypeSchema = z.enum([
  "ask_question",
  "acknowledge_answer",
  "ask_follow_up",
  "clarify",
  "move_to_next_topic",
  "finish_interview",
]);
export type EngineEventType = z.infer<typeof engineEventTypeSchema>;

export const engineEventSchema = z.object({
  type: engineEventTypeSchema,
  text: z.string().min(1),
  questionId: z.string().uuid().optional(),
  competency: z.string().optional(),
});
export type EngineEvent = z.infer<typeof engineEventSchema>;

// ─── LLM turn decision (structured output) ────────────────────────────────────

export const turnActionSchema = z.enum([
  "acknowledge",
  "follow_up",
  "next_question",
  "clarify",
  "finish",
]);
export type TurnAction = z.infer<typeof turnActionSchema>;

/**
 * What the LLM proposes for the next interviewer utterance. The engine validates
 * this against budgets/state before it is spoken or persisted.
 */
export const turnDecisionSchema = z.object({
  action: turnActionSchema,
  spokenText: z.string().min(1).max(600),
  followUpText: z.string().nullable(),
  notes: z.string().nullable(),
});
export type TurnDecision = z.infer<typeof turnDecisionSchema>;

// ─── Answer evaluation & report ───────────────────────────────────────────────

export const dimensionScoreSchema = z.object({
  dimension: evaluationDimensionSchema,
  score: z.number().min(0).max(100).nullable(),
  rationale: z.string(),
});
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;

export const answerEvaluationSchema = z.object({
  questionId: z.string(),
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.array(dimensionScoreSchema),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  evidenceExcerpts: z.array(z.string()),
  exampleAnswer: z.string().nullable(),
  summary: z.string(),
});
export type AnswerEvaluation = z.infer<typeof answerEvaluationSchema>;

export const competencyBreakdownSchema = z.object({
  competency: z.string(),
  score: z.number().min(0).max(100),
  note: z.string(),
});
export type CompetencyBreakdown = z.infer<typeof competencyBreakdownSchema>;

export const learningPlanItemSchema = z.object({
  focus: z.string(),
  action: z.string(),
  practiceQuestion: z.string(),
});
export type LearningPlanItem = z.infer<typeof learningPlanItemSchema>;

export const finalReportSchema = z.object({
  summary: z.string(),
  overallScore: z.number().min(0).max(100),
  competencies: z.array(competencyBreakdownSchema),
  learningPlan: z.array(learningPlanItemSchema),
  disclaimer: z.string(),
});
export type FinalReport = z.infer<typeof finalReportSchema>;

// ─── Wizard input ─────────────────────────────────────────────────────────────

export const maxJobDescriptionChars = 20_000;

export const interviewConfigSchema = z.object({
  jobTitle: z.string().trim().min(2, "Job title is required").max(200),
  companyName: z.string().trim().max(200).optional(),
  jobDescription: z
    .string()
    .trim()
    .min(80, "Paste the full job description (at least 80 characters)")
    .max(maxJobDescriptionChars, `Job description is limited to ${maxJobDescriptionChars} characters`),
  language: interviewLanguageSchema,
  interviewType: interviewTypeSchema,
  difficulty: difficultySchema,
  durationMinutes: durationSchema,
  persona: interviewerPersonaIdSchema,
  candidateBackground: z.string().trim().max(10_000).optional(),
});
export type InterviewConfig = z.infer<typeof interviewConfigSchema>;
