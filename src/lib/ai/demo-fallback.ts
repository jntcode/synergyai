import "server-only";
import type {
  AnswerEvaluation,
  DimensionScore,
  EvaluationDimension,
  FinalReport,
  InterviewConfig,
  InterviewPlan,
  JobAnalysis,
  PlannedQuestion,
} from "@/lib/ai/schemas";

/**
 * DEMO FALLBACKS — used only when OPENAI_API_KEY is not configured.
 * These are deterministic, rule-based heuristics. They are NEVER presented as
 * AI output: every surface that consumes them must show a "Demo analysis"
 * badge. They exist so the product flow stays usable and testable offline.
 */

const TECH_HINTS = [
  "javascript", "typescript", "react", "node", "python", "java", "sql", "aws",
  "docker", "kubernetes", "graphql", "rest", "api", "ci/cd", "test", "testing",
  "machine learning", "data", "frontend", "backend", "full stack", "devops",
  "css", "html", "security", "cloud", "golang", "rust", "django", "rails",
];

const BEHAVIOR_HINTS = [
  "stakeholder", "team", "communicat", "conflict", "deadline", "leadership",
  "mentor", "collaborat", "feedback", "priorit", "ownership", "initiative",
];

/** Human-readable names for detected technologies, used in questions and reports. */
const TECH_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  node: "Node.js",
  python: "Python",
  java: "Java",
  sql: "SQL",
  aws: "AWS",
  docker: "Docker",
  kubernetes: "Kubernetes",
  graphql: "GraphQL",
  rest: "REST APIs",
  api: "API design",
  "ci/cd": "CI/CD",
  test: "Testing",
  testing: "Testing",
  "machine learning": "Machine learning",
  data: "Data analysis",
  frontend: "Frontend development",
  backend: "Backend development",
  "full stack": "Full-stack development",
  devops: "DevOps",
  css: "CSS",
  html: "HTML",
  security: "Security",
  cloud: "Cloud infrastructure",
  golang: "Go",
  rust: "Rust",
  django: "Django",
  rails: "Ruby on Rails",
};

/** Human-readable names for detected behavioral themes. */
const BEHAVIOR_LABELS: Record<string, string> = {
  stakeholder: "Stakeholder management",
  team: "Teamwork",
  communicat: "Communication",
  conflict: "Conflict resolution",
  deadline: "Working to deadlines",
  leadership: "Leadership",
  mentor: "Mentoring",
  collaborat: "Collaboration",
  feedback: "Giving and receiving feedback",
  priorit: "Prioritization",
  ownership: "Ownership",
  initiative: "Initiative",
};

function techLabel(term: string): string {
  return TECH_LABELS[term] ?? term.charAt(0).toUpperCase() + term.slice(1);
}

function behaviorLabel(term: string): string {
  return BEHAVIOR_LABELS[term] ?? term.charAt(0).toUpperCase() + term.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

const SENIORITY_HINTS: { level: string; words: string[] }[] = [
  { level: "intern", words: ["intern", "internship", "estágio", "trainee"] },
  { level: "entry", words: ["junior", "jr", "entry", "graduate", "new grad", "júnior"] },
  { level: "lead", words: ["lead", "staff", "principal", "head of", "diretor"] },
  { level: "senior", words: ["senior", "sr", "sênior", "specialist"] },
  { level: "mid", words: ["mid-level", "middle", "pleno"] },
];

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9À-ÿ+#./-]+/i).filter(Boolean);
}

function countHits(text: string, hints: string[]): number {
  const lower = text.toLowerCase();
  return hints.filter((h) => lower.includes(h)).length;
}

export function demoAnalyzeJob(config: InterviewConfig): JobAnalysis {
  const blob = `${config.jobTitle}\n${config.jobDescription}`;
  const lower = blob.toLowerCase();
  const detectedTech = TECH_HINTS.filter((t) => lower.includes(t));
  const detectedBehavior = BEHAVIOR_HINTS.filter((t) => lower.includes(t));

  let seniority: JobAnalysis["seniority"] = "unknown";
  for (const { level, words: ws } of SENIORITY_HINTS) {
    if (ws.some((w) => lower.includes(w))) {
      seniority = level as JobAnalysis["seniority"];
      break;
    }
  }
  if (seniority === "unknown") seniority = "mid";

  // Extract responsibility-looking lines (sentences with verbs of ownership).
  const responsibilities = config.jobDescription
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 300)
    .filter((s) => /\b(you|will|responsible|develop|build|own|manage|design|lead|deliver|support|maintain)\b/i.test(s))
    .slice(0, 8);

  const total = config.durationMinutes >= 30 ? 8 : config.durationMinutes >= 20 ? 6 : 4;
  const technicalShare = detectedTech.length >= 3 ? 0.5 : 0.3;

  return {
    normalizedRoleTitle: config.jobTitle.trim(),
    seniority,
    responsibilities:
      responsibilities.length > 0
        ? responsibilities
        : [`Core responsibilities as described for the ${config.jobTitle} role.`],
    requiredSkills: detectedTech.slice(0, 10),
    preferredSkills: detectedTech.slice(10, 14),
    technicalCompetencies: detectedTech.slice(0, 5).map(techLabel),
    behavioralCompetencies: detectedBehavior
      .slice(0, 4)
      .map(behaviorLabel),
    themes: [
      `${config.jobTitle} role motivation`,
      "Relevant experience",
      ...(detectedTech.length > 0 ? ["Technical depth"] : ["Role-specific scenarios"]),
      "Collaboration & communication",
    ],
    questionDistribution: {
      behavioral: Math.round(total * (1 - technicalShare)),
      technical: Math.round(total * technicalShare),
      roleSpecific: 1,
      hrScreening: config.interviewType === "hr_screening" ? total : 0,
      caseStudy: config.interviewType === "case_study" ? Math.max(1, Math.round(total / 2)) : 0,
    },
    evaluationCriteria: [
      "Relevance to the question",
      "Specificity with concrete examples",
      "Clear communication structure",
    ],
    uncertainties: [
      "Demo analysis (no AI credentials): based on keyword heuristics only.",
      "Company-specific context was not inferred.",
    ],
  };
}

function buildDemoQuestions(config: InterviewConfig, analysis: JobAnalysis): PlannedQuestion[] {
  const lang = config.language;
  const skillHint = analysis.requiredSkills[0];
  const skill2Hint = analysis.requiredSkills[1] ?? skillHint;
  const skill = skillHint ? techLabel(skillHint) : "the core skills for this role";
  const skill2 = skill2Hint ? techLabel(skill2Hint) : skill;
  const behavior = analysis.behavioralCompetencies[0] ?? "Teamwork";
  const behaviorExample = lowerFirst(behavior);

  const bankEn: Omit<PlannedQuestion, "sequence">[] = [
    {
      text: "Thanks for joining. To start, what interests you most about this role?",
      category: "hr_screening",
      competency: "Motivation",
      dimensions: ["relevance", "communication"],
      keyPoints: ["Links experience to the role", "Specific, not generic"],
      estimatedSeconds: 90,
    },
    {
      text: `Tell me about your experience with ${skill}. What was the hardest part, and how did you handle it?`,
      category: "technical",
      competency: analysis.technicalCompetencies[0] ?? "Technical skills",
      dimensions: ["relevance", "accuracy", "specificity", "reasoning"],
      keyPoints: ["Concrete project context", "Explains trade-offs", "Names the outcome"],
      estimatedSeconds: 150,
    },
    {
      text: `Describe a situation where you had to collaborate under pressure — for example around ${behaviorExample}. What did you do, and what was the result?`,
      category: "behavioral",
      competency: behavior,
      dimensions: ["relevance", "specificity", "evidence", "communication"],
      keyPoints: ["Clear situation", "Own actions", "Result or learning"],
      estimatedSeconds: 150,
    },
    {
      text: `If you joined our team and discovered a critical issue in ${skill2}, how would you approach it in your first week?`,
      category: "role_specific",
      competency: "Problem solving",
      dimensions: ["reasoning", "relevance", "communication"],
      keyPoints: ["Assesses impact first", "Involves stakeholders", "Iterates carefully"],
      estimatedSeconds: 120,
    },
    {
      text: "Walk me through how you would break down a large ambiguous task into deliverables.",
      category: "technical",
      competency: "Planning & decomposition",
      dimensions: ["reasoning", "specificity", "communication"],
      keyPoints: ["Clarifies goals", "Sequences work", "Considers risks"],
      estimatedSeconds: 120,
    },
    {
      text: "What feedback have you received that changed how you work? How did you apply it?",
      category: "behavioral",
      competency: "Growth mindset",
      dimensions: ["relevance", "evidence", "communication"],
      keyPoints: ["Real example", "Shows change in behavior", "Reflective"],
      estimatedSeconds: 120,
    },
    {
      text: "How do you keep your skills current, and how do you decide what to learn next?",
      category: "behavioral",
      competency: "Continuous learning",
      dimensions: ["relevance", "specificity", "communication"],
      keyPoints: ["Concrete learning habits", "Tied to goals"],
      estimatedSeconds: 90,
    },
    {
      text: "Do you have any questions for me about the team or the role?",
      category: "hr_screening",
      competency: "Candidate engagement",
      dimensions: ["relevance", "communication"],
      keyPoints: ["Asks thoughtful questions"],
      estimatedSeconds: 90,
    },
  ];

  const bankPt: Omit<PlannedQuestion, "sequence">[] = [
    {
      text: "Obrigado por participar. Para começar, o que mais te interessa nesta vaga?",
      category: "hr_screening",
      competency: "Motivação",
      dimensions: ["relevance", "communication"],
      keyPoints: ["Conecta experiência à vaga", "Resposta específica"],
      estimatedSeconds: 90,
    },
    {
      text: `Conte sobre sua experiência com ${skill}. Qual foi a parte mais difícil e como você lidou com isso?`,
      category: "technical",
      competency: analysis.technicalCompetencies[0] ?? "Competências técnicas",
      dimensions: ["relevance", "accuracy", "specificity", "reasoning"],
      keyPoints: ["Contexto concreto de projeto", "Explica trade-offs", "Resultado claro"],
      estimatedSeconds: 150,
    },
    {
      text: `Descreva uma situação em que você precisou colaborar sob pressão — por exemplo, em torno de ${behaviorExample}. O que você fez e qual foi o resultado?`,
      category: "behavioral",
      competency: behavior,
      dimensions: ["relevance", "specificity", "evidence", "communication"],
      keyPoints: ["Situação clara", "Ações próprias", "Resultado ou aprendizado"],
      estimatedSeconds: 150,
    },
    {
      text: `Se você entrasse no time e encontrasse um problema crítico em ${skill2}, como você abordaria isso na primeira semana?`,
      category: "role_specific",
      competency: "Resolução de problemas",
      dimensions: ["reasoning", "relevance", "communication"],
      keyPoints: ["Avalia impacto primeiro", "Envolve stakeholders", "Itera com cuidado"],
      estimatedSeconds: 120,
    },
    {
      text: "Explique como você quebraria uma tarefa grande e ambígua em entregas.",
      category: "technical",
      competency: "Planejamento e decomposição",
      dimensions: ["reasoning", "specificity", "communication"],
      keyPoints: ["Esclarece objetivos", "Sequencia o trabalho", "Considera riscos"],
      estimatedSeconds: 120,
    },
    {
      text: "Que feedback você já recebeu que mudou sua forma de trabalhar? Como aplicou isso?",
      category: "behavioral",
      competency: "Mentalidade de crescimento",
      dimensions: ["relevance", "evidence", "communication"],
      keyPoints: ["Exemplo real", "Mudança de comportamento", "Reflexão"],
      estimatedSeconds: 120,
    },
    {
      text: "Como você mantém suas habilidades atualizadas e como decide o que aprender?",
      category: "behavioral",
      competency: "Aprendizado contínuo",
      dimensions: ["relevance", "specificity", "communication"],
      keyPoints: ["Hábitos concretos", "Ligados a objetivos"],
      estimatedSeconds: 90,
    },
    {
      text: "Você tem perguntas para mim sobre o time ou a vaga?",
      category: "hr_screening",
      competency: "Engajamento do candidato",
      dimensions: ["relevance", "communication"],
      keyPoints: ["Perguntas relevantes"],
      estimatedSeconds: 90,
    },
  ];

  const langBank = lang === "pt" ? bankPt : bankEn;
  const budget = config.durationMinutes >= 30 ? 7 : config.durationMinutes >= 20 ? 5 : 4;
  return langBank.slice(0, budget).map((q, i) => ({ ...q, sequence: i + 1 }));
}

export function demoGeneratePlan(config: InterviewConfig, analysis: JobAnalysis): InterviewPlan {
  const questions = buildDemoQuestions(config, analysis);
  const competencies: {
    id: string;
    name: string;
    kind: "technical" | "behavioral" | "role_specific";
    description: string;
    weight: number;
  }[] = [
    ...analysis.technicalCompetencies.slice(0, 3).map((name, i) => ({
      id: `tech-${i}`,
      name,
      kind: "technical" as const,
      description: `Demonstrated ability related to ${name}.`,
      weight: 0.25,
    })),
    ...analysis.behavioralCompetencies.slice(0, 2).map((name, i) => ({
      id: `beh-${i}`,
      name,
      kind: "behavioral" as const,
      description: `Observable behaviors around ${name}.`,
      weight: 0.15,
    })),
  ];
  if (competencies.length < 2) {
    competencies.push(
      {
        id: "comm",
        name: config.language === "pt" ? "Comunicação" : "Communication",
        kind: "behavioral",
        description: "Clarity, structure, and concision of answers.",
        weight: 0.3,
      },
      {
        id: "role",
        name: config.language === "pt" ? "Fit de função" : "Role fit",
        kind: "role_specific",
        description: "Alignment of experience with the role's core responsibilities.",
        weight: 0.3,
      },
    );
  }
  const totalWeight = competencies.reduce((s, c) => s + c.weight, 0) || 1;
  for (const c of competencies) c.weight = Math.round((c.weight / totalWeight) * 100) / 100;

  return {
    roleTitle: analysis.normalizedRoleTitle,
    seniority: analysis.seniority,
    language: config.language,
    interviewType: config.interviewType,
    difficulty: config.difficulty,
    durationMinutes: config.durationMinutes,
    competencies,
    questions,
    openingRemarks:
      config.language === "pt"
        ? "Olá! Sou seu entrevistador de IA para esta sessão de prática. A conversa é gravada apenas como texto para gerar seu relatório. Vamos começar."
        : "Hello! I'm your AI interviewer for this practice session. The conversation is recorded as text only, to build your report. Let's get started.",
    closingRemarks:
      config.language === "pt"
        ? "Ótimo trabalho. Isso encerra a entrevista de prática — seu relatório estará pronto em instantes."
        : "Great work. That wraps up the practice interview — your report will be ready shortly.",
  };
}

/** Heuristic evaluation used only in demo mode (no AI credentials). */
export function demoEvaluateAnswers(input: {
  language: "en" | "pt";
  items: { questionId: string; competency: string; answerTranscript: string; keyPoints: string[] }[];
}): AnswerEvaluation[] {
  return input.items.map((item) => {
    const text = item.answerTranscript.trim();
    const w = words(text);
    const wordCount = w.length;
    const score = Math.max(20, Math.min(95, 35 + wordCount));
    const isPt = input.language === "pt";
    const empty = wordCount < 5;

    const dimensionScores: DimensionScore[] = (
      ["relevance", "specificity", "communication"] as EvaluationDimension[]
    ).map((dimension) => ({
      dimension,
      score: empty ? null : Math.max(25, Math.min(95, score + (dimension === "specificity" ? -5 : 0))),
      rationale: empty
        ? isPt
          ? "Sem resposta suficiente para avaliar."
          : "Not enough answer content to evaluate."
        : isPt
          ? "Estimativa heurística do modo demo (sem credenciais de IA)."
          : "Demo-mode heuristic estimate (AI credentials not configured).",
    }));

    return {
      questionId: item.questionId,
      overallScore: empty ? 0 : score,
      dimensionScores,
      strengths: empty
        ? []
        : [
            isPt
              ? "Você respondeu à pergunta em vez de desviar do tema."
              : "You addressed the question rather than avoiding it.",
          ],
      improvements: empty
        ? [
            isPt
              ? "Tente estruturar respostas com situação, ação e resultado."
              : "Try structuring answers with situation, action, and result.",
          ]
        : [
            isPt
              ? "Adicione um exemplo concreto com resultado mensurável."
              : "Add one concrete example with a measurable result.",
          ],
      evidenceExcerpts: text ? [text.slice(0, 240)] : [],
      exampleAnswer: null,
      summary: empty
        ? isPt
          ? "Resposta vazia ou muito curta."
          : "Answer was empty or too short."
        : isPt
          ? "Avaliação de demonstração: revise os pontos-chave da pergunta e inclua detalhes específicos."
          : "Demo assessment: revisit the question's key points and include specific details.",
    };
  });
}

export function demoBuildFinalReport(input: {
  language: "en" | "pt";
  evaluations: AnswerEvaluation[];
  competencies: { name: string }[];
}): FinalReport {
  const isPt = input.language === "pt";
  const scores = input.evaluations.map((e) => e.overallScore).filter((s) => s > 0);
  const overall =
    scores.length === 0 ? 0 : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    summary: isPt
      ? `Relatório de demonstração: sua prática para esta função teve desempenho médio de ${overall}/100. Configure OPENAI_API_KEY para avaliações com IA detalhadas.`
      : `Demo report: your practice for this role averaged ${overall}/100. Configure OPENAI_API_KEY for detailed AI evaluations.`,
    overallScore: overall,
    competencies: input.competencies.map((c) => ({
      competency: c.name,
      score: overall,
      note: isPt ? "Estimativa demo (sem IA)." : "Demo estimate (no AI).",
    })),
    learningPlan: [
      {
        focus: isPt ? "Respostas com exemplos" : "Example-driven answers",
        action: isPt
          ? "Prepare 2 histórias STAR das suas experiências."
          : "Prepare 2 STAR stories from your experience.",
        practiceQuestion: isPt
          ? "Conte sobre um projeto desafiador e o resultado."
          : "Tell me about a challenging project and the result.",
      },
      {
        focus: isPt ? "Clareza" : "Clarity",
        action: isPt
          ? "Pratique respostas de 60–90 segundos."
          : "Practice 60–90 second answers.",
        practiceQuestion: isPt
          ? "Explique um trade-off técnico em linguagem simples."
          : "Explain a technical trade-off in simple language.",
      },
    ],
    disclaimer: isPt
      ? "Avaliações de demonstração — não são previsões de contratação."
      : "Demo assessments — not hiring predictions.",
  };
}

export { countHits };
