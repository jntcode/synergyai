import { describe, expect, it } from "vitest";
import {
  demoAnalyzeJob,
  demoBuildFinalReport,
  demoEvaluateAnswers,
  demoGeneratePlan,
} from "@/lib/ai/demo-fallback";
import { interviewPlanSchema, type InterviewConfig } from "@/lib/ai/schemas";

const baseConfig: InterviewConfig = {
  jobTitle: "Senior React Developer",
  companyName: "Acme",
  jobDescription:
    "We are hiring a Senior React Developer. You will design and build frontend features in " +
    "TypeScript and React, own CI/CD pipelines, collaborate with stakeholders, mentor engineers, " +
    "and deliver high-quality tested code. Experience with Node, GraphQL, testing, " +
    "and cloud platforms is preferred. You will manage deadlines and communicate clearly.",
  language: "en",
  interviewType: "mixed",
  difficulty: "intermediate",
  durationMinutes: 20,
  persona: "technical_challenger",
  candidateBackground: "5 years building React apps.",
};

describe("demoAnalyzeJob", () => {
  it("detects seniority from the title/description", () => {
    expect(demoAnalyzeJob(baseConfig).seniority).toBe("senior");
  });

  it("detects technical and behavioral competencies", () => {
    const a = demoAnalyzeJob(baseConfig);
    expect(a.requiredSkills.length).toBeGreaterThan(0);
    expect(a.behavioralCompetencies.length).toBeGreaterThan(0);
  });

  it("flags demo mode in uncertainties", () => {
    const a = demoAnalyzeJob(baseConfig);
    expect(a.uncertainties.join(" ").toLowerCase()).toContain("demo");
  });

  it("defaults to mid when nothing matches", () => {
    const a = demoAnalyzeJob({ ...baseConfig, jobTitle: "Generic Role", jobDescription: "x".repeat(120) });
    expect(a.seniority).not.toBe("unknown");
  });
});

describe("demoGeneratePlan", () => {
  it("produces a plan that satisfies interviewPlanSchema", () => {
    const analysis = demoAnalyzeJob(baseConfig);
    const plan = demoGeneratePlan(baseConfig, analysis);
    const parsed = interviewPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it("scales question count with duration", () => {
    const analysis = demoAnalyzeJob(baseConfig);
    const short = demoGeneratePlan({ ...baseConfig, durationMinutes: 10 }, analysis);
    const long = demoGeneratePlan({ ...baseConfig, durationMinutes: 30 }, analysis);
    expect(long.questions.length).toBeGreaterThan(short.questions.length);
  });

  it("uses Portuguese text for pt configs", () => {
    const ptConfig = { ...baseConfig, language: "pt" as const };
    const plan = demoGeneratePlan(ptConfig, demoAnalyzeJob(ptConfig));
    expect(plan.language).toBe("pt");
    expect(plan.openingRemarks).toMatch(/[áéíóúçãõ]/i);
    expect(plan.closingRemarks).toMatch(/[áéíóúçãõ]/i);
  });

  it("sequences questions from 1", () => {
    const plan = demoGeneratePlan(baseConfig, demoAnalyzeJob(baseConfig));
    plan.questions.forEach((q, i) => expect(q.sequence).toBe(i + 1));
  });
});

describe("demoEvaluateAnswers", () => {
  const items = [
    {
      questionId: "q1",
      competency: "Communication",
      answerTranscript:
        "I led a migration to TypeScript across three services, wrote codemods, " +
        "partnered with the platform team, and cut type-related production incidents by half.",
      keyPoints: ["concrete", "result"],
    },
  ];

  it("scores a substantive answer above an empty one", () => {
    const [good, empty] = [
      demoEvaluateAnswers({ language: "en", items })[0]!,
      demoEvaluateAnswers({
        language: "en",
        items: [{ ...items[0]!, answerTranscript: "Um" }],
      })[0]!,
    ];
    expect(good.overallScore).toBeGreaterThan(empty.overallScore);
    expect(empty.overallScore).toBe(0);
  });

  it("includes an evidence excerpt from the transcript", () => {
    const ev = demoEvaluateAnswers({ language: "en", items })[0]!;
    expect(ev.evidenceExcerpts[0]).toContain("TypeScript");
  });

  it("uses Portuguese copy for pt", () => {
    const ev = demoEvaluateAnswers({ language: "pt", items })[0]!;
    expect(ev.summary).toMatch(/[áéíóúçãõ]/i);
    expect(ev.improvements[0]).toMatch(/[áéíóúçãõ]/i);
  });

  it("nulls dimension scores for empty answers", () => {
    const ev = demoEvaluateAnswers({
      language: "en",
      items: [{ ...items[0]!, answerTranscript: "" }],
    })[0]!;
    for (const d of ev.dimensionScores) expect(d.score).toBeNull();
  });
});

describe("demoBuildFinalReport", () => {
  it("averages non-zero evaluation scores", () => {
    const evaluations = demoEvaluateAnswers({
      language: "en",
      items: [
        {
          questionId: "q1",
          competency: "C",
          answerTranscript: "A reasonably detailed answer with context action and result here.",
          keyPoints: [],
        },
        {
          questionId: "q2",
          competency: "C",
          answerTranscript: "",
          keyPoints: [],
        },
      ],
    });
    const report = demoBuildFinalReport({
      language: "en",
      evaluations,
      competencies: [{ name: "Communication" }],
    });
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.competencies[0]?.competency).toBe("Communication");
    expect(report.disclaimer.toLowerCase()).toContain("demo");
    expect(report.learningPlan.length).toBeGreaterThan(0);
  });

  it("returns 0 overall when every answer is empty", () => {
    const report = demoBuildFinalReport({
      language: "en",
      evaluations: [],
      competencies: [],
    });
    expect(report.overallScore).toBe(0);
  });
});
