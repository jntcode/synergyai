import type { InterviewerPersonaId, InterviewLanguage } from "@/lib/ai/schemas";

export interface InterviewerPersona {
  id: InterviewerPersonaId;
  name: string;
  title: string;
  /** Short description shown on the selection card. */
  blurb: string;
  stylePrompt: string;
  /** Fallback avatar color classes if a portrait fails to load. */
  accentClass: string;
  /**
   * Licensed stock photograph used as the interviewer's practice portrait.
   * A fictional persona, not a real interviewer or a live video stream.
   */
  portraitSrc: string;
  /** CSS object-position used to keep the subject in frame on narrow screens. */
  portraitPosition?: string;
}

export const INTERVIEWER_PERSONAS: readonly InterviewerPersona[] = [
  {
    id: "friendly_recruiter",
    name: "Avery",
    title: "Friendly recruiter",
    blurb:
      "Warm and encouraging. Great for first mock interviews, HR screens, and building confidence.",
    stylePrompt:
      "You are a warm, encouraging recruiter. You smile with your words, keep things light, " +
      "explain the format clearly, and gently probe for concrete examples. Never harsh.",
    accentClass: "bg-elevated text-foreground",
    portraitSrc: "/interviewers/avery.jpg",
  },
  {
    id: "corporate_interviewer",
    name: "Morgan",
    title: "Professional corporate interviewer",
    blurb:
      "Polite and structured. Mirrors a standard corporate loop with clear, balanced questions.",
    stylePrompt:
      "You are a professional, polished corporate interviewer. You follow a clear structure, " +
      "stay neutral and courteous, and keep the conversation moving at a steady pace.",
    accentClass: "bg-elevated text-foreground",
    portraitSrc: "/interviewers/morgan.jpg",
  },
  {
    id: "technical_challenger",
    name: "Riley",
    title: "Challenging technical interviewer",
    blurb:
      "Dig deeper with sharp follow-ups. Best for engineering and analytical roles.",
    stylePrompt:
      "You are a rigorous technical interviewer. You ask precise questions, push (politely) " +
      "for depth and trade-offs with short follow-ups, and never accept vague answers without probing.",
    accentClass: "bg-elevated text-foreground",
    portraitSrc: "/interviewers/riley.jpg",
    portraitPosition: "78% 26%",
  },
  {
    id: "senior_hiring_manager",
    name: "Cameron",
    title: "Senior hiring manager",
    blurb:
      "Big-picture and seniority-aware. Focuses on impact, ownership, and judgment.",
    stylePrompt:
      "You are a senior hiring manager. You care about impact, ownership, prioritization, " +
      "and judgment. You ask about outcomes and trade-offs, not trivia.",
    accentClass: "bg-elevated text-foreground",
    portraitSrc: "/interviewers/cameron.jpg",
  },
] as const;

export function getPersona(id: InterviewerPersonaId): InterviewerPersona {
  const found = INTERVIEWER_PERSONAS.find((p) => p.id === id);
  if (!found) return INTERVIEWER_PERSONAS[0]!;
  return found;
}

export function languageInstruction(language: InterviewLanguage): string {
  return language === "pt"
    ? "Conduct the entire interview in Brazilian Portuguese. Keep utterances concise and natural."
    : "Conduct the entire interview in English. Keep utterances concise and natural.";
}
