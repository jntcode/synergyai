import type {
  AnswerEvaluation,
  CompetencyBreakdown,
  DimensionScore,
  Difficulty,
  FinalReport,
  InterviewLanguage,
  InterviewPlan,
  InterviewType,
  InterviewerPersonaId,
  LearningPlanItem,
} from "@/lib/ai/schemas";
import type { EngineMemory } from "@/lib/interview/engine";
import type { SessionStatus } from "@/lib/interview/state-machine";

export interface Profile {
  id: string;
  displayName: string | null;
  preferredLanguage: InterviewLanguage;
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionRecord {
  id: string;
  userId: string;
  jobTitle: string;
  companyName: string | null;
  rawDescription: string;
  parsed: unknown | null;
  language: InterviewLanguage;
  createdAt: string;
}

export interface InterviewSessionRecord {
  id: string;
  userId: string;
  jobDescriptionId: string | null;
  interviewType: InterviewType;
  language: InterviewLanguage;
  difficulty: Difficulty;
  durationMinutes: number;
  persona: InterviewerPersonaId;
  status: SessionStatus;
  avatarProvider: string;
  providerSessionRef: string | null;
  plan: InterviewPlan | null;
  engineMemory: EngineMemory | null;
  isDemoAnalysis: boolean;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionRecord {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  text: string;
  category: string;
  competency: string;
  keyPoints: string[];
  dimensions: EvaluationDimensionLike[];
  createdAt: string;
}

type EvaluationDimensionLike = DimensionScore["dimension"];

export type AnswerSource = "avatar_stt" | "typed" | "demo_text";

export interface AnswerRecord {
  id: string;
  sessionId: string;
  questionId: string | null;
  transcript: string;
  durationSeconds: number | null;
  source: AnswerSource;
  createdAt: string;
}

export interface EvaluationRecord {
  id: string;
  sessionId: string;
  questionId: string | null;
  overallScore: number;
  dimensionScores: DimensionScore[];
  strengths: string[];
  improvements: string[];
  evidenceExcerpts: string[];
  exampleAnswer: string | null;
  summary: string;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  sessionId: string;
  summary: string;
  overallScore: number;
  competencies: CompetencyBreakdown[];
  learningPlan: LearningPlanItem[];
  disclaimer: string;
  createdAt: string;
}

export interface TranscriptSegment {
  role: "interviewer" | "candidate";
  text: string;
  at: string;
}

export interface SessionSummary {
  id: string;
  jobTitle: string;
  companyName: string | null;
  interviewType: InterviewType;
  language: InterviewLanguage;
  difficulty: Difficulty;
  durationMinutes: number;
  persona: InterviewerPersonaId;
  status: SessionStatus;
  avatarProvider: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  reportOverallScore: number | null;
}

export interface CreateSessionInput {
  userId: string;
  jobTitle: string;
  companyName: string | null;
  rawDescription: string;
  language: InterviewLanguage;
  interviewType: InterviewType;
  difficulty: Difficulty;
  durationMinutes: number;
  persona: InterviewerPersonaId;
  parsed: unknown | null;
  plan: InterviewPlan | null;
  isDemoAnalysis: boolean;
}

export type { AnswerEvaluation, FinalReport, InterviewPlan };
