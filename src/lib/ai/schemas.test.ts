import { describe, expect, it } from "vitest";
import {
  engineEventSchema,
  finalReportSchema,
  interviewConfigSchema,
  interviewPlanSchema,
  maxJobDescriptionChars,
  turnDecisionSchema,
  type InterviewConfig,
} from "@/lib/ai/schemas";

const validConfig: InterviewConfig = {
  jobTitle: "Frontend Engineer",
  jobDescription:
    "We are looking for a Frontend Engineer to build React applications. " +
    "You will own UI features, collaborate with design, write tests, and ship to production. ".repeat(3),
  language: "en",
  interviewType: "mixed",
  difficulty: "intermediate",
  durationMinutes: 20,
  persona: "friendly_recruiter",
};

describe("interviewConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(interviewConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it("rejects a job title shorter than 2 chars", () => {
    const r = interviewConfigSchema.safeParse({ ...validConfig, jobTitle: "A" });
    expect(r.success).toBe(false);
  });

  it("rejects a job description under 80 characters", () => {
    const r = interviewConfigSchema.safeParse({ ...validConfig, jobDescription: "Too short." });
    expect(r.success).toBe(false);
  });

  it("rejects an over-long job description", () => {
    const r = interviewConfigSchema.safeParse({
      ...validConfig,
      jobDescription: "x".repeat(maxJobDescriptionChars + 1),
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid enum values", () => {
    expect(
      interviewConfigSchema.safeParse({ ...validConfig, language: "fr" }).success,
    ).toBe(false);
    expect(
      interviewConfigSchema.safeParse({ ...validConfig, durationMinutes: 15 }).success,
    ).toBe(false);
    expect(
      interviewConfigSchema.safeParse({ ...validConfig, persona: "mean_boss" }).success,
    ).toBe(false);
  });
});

describe("engineEventSchema", () => {
  it("requires non-empty text and a known type", () => {
    expect(
      engineEventSchema.safeParse({ type: "ask_question", text: "Hello?" }).success,
    ).toBe(true);
    expect(engineEventSchema.safeParse({ type: "ask_question", text: "" }).success).toBe(false);
    expect(engineEventSchema.safeParse({ type: "dance", text: "Hi" }).success).toBe(false);
  });

  it("accepts an optional uuid questionId and rejects a non-uuid when present", () => {
    expect(
      engineEventSchema.safeParse({
        type: "ask_question",
        text: "Q?",
        questionId: "123e4567-e89b-12d3-a456-426614174000",
      }).success,
    ).toBe(true);
    expect(
      engineEventSchema.safeParse({ type: "ask_question", text: "Q?", questionId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });
});

describe("turnDecisionSchema", () => {
  it("accepts a valid decision", () => {
    const r = turnDecisionSchema.safeParse({
      action: "follow_up",
      spokenText: "What was the result?",
      followUpText: "What was the result?",
      notes: "probe",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty spoken text and over-long text", () => {
    expect(
      turnDecisionSchema.safeParse({
        action: "acknowledge",
        spokenText: "",
        followUpText: null,
        notes: null,
      }).success,
    ).toBe(false);
    expect(
      turnDecisionSchema.safeParse({
        action: "acknowledge",
        spokenText: "x".repeat(601),
        followUpText: null,
        notes: null,
      }).success,
    ).toBe(false);
  });
});

describe("finalReportSchema", () => {
  it("rejects out-of-range scores", () => {
    const base = {
      summary: "ok",
      overallScore: 70,
      competencies: [{ competency: "C", score: 70, note: "n" }],
      learningPlan: [],
      disclaimer: "practice only",
    };
    expect(finalReportSchema.safeParse(base).success).toBe(true);
    expect(finalReportSchema.safeParse({ ...base, overallScore: -1 }).success).toBe(false);
    expect(finalReportSchema.safeParse({ ...base, overallScore: 101 }).success).toBe(false);
  });
});

describe("interviewPlanSchema", () => {
  it("requires at least two competencies and two questions", () => {
    const minimal = {
      roleTitle: "X",
      seniority: "mid",
      language: "en",
      interviewType: "mixed",
      difficulty: "intermediate",
      durationMinutes: 20,
      competencies: [{ id: "c", name: "C", kind: "technical", description: "", weight: 1 }],
      questions: [
        {
          sequence: 1,
          text: "Tell me about yourself?",
          category: "behavioral",
          competency: "C",
          dimensions: ["relevance"],
          keyPoints: [],
          estimatedSeconds: 60,
        },
      ],
      openingRemarks: "Welcome to the interview.",
      closingRemarks: "Thanks, that is all.",
    };
    expect(interviewPlanSchema.safeParse(minimal).success).toBe(false);
  });
});
