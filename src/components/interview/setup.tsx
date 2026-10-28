"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Loader2,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useHealth } from "@/lib/hooks";
import { getPersona } from "@/lib/interview/personas";
import type { InterviewerPersonaId } from "@/lib/ai/schemas";

const ROLE_SUGGESTIONS = [
  "Software Engineer",
  "Product Manager",
  "Data Analyst",
  "Marketing Specialist",
] as const;

const TYPES = [
  {
    id: "behavioral",
    label: "Behavioral",
    description: "Stories, collaboration, and judgment",
  },
  {
    id: "technical",
    label: "Technical",
    description: "Role depth and problem-solving",
  },
  {
    id: "mixed",
    label: "General",
    description: "Balanced, role-focused conversation",
  },
] as const;

const LEVELS = [
  { id: "beginner", label: "Entry", hint: "Early career" },
  { id: "intermediate", label: "Mid", hint: "Some experience" },
  { id: "advanced", label: "Senior", hint: "Leadership & impact" },
] as const;

const DURATIONS = [10, 20, 30] as const;

type InterviewTypeChoice = (typeof TYPES)[number]["id"];
type LevelChoice = (typeof LEVELS)[number]["id"];
type DurationChoice = (typeof DURATIONS)[number];
type LanguageChoice = "en" | "pt";

function personaFor(type: InterviewTypeChoice, level: LevelChoice): InterviewerPersonaId {
  if (type === "technical") return "technical_challenger";
  if (type === "behavioral") return "friendly_recruiter";
  if (level === "advanced") return "senior_hiring_manager";
  return "corporate_interviewer";
}

function buildDescription(
  role: string,
  type: InterviewTypeChoice,
  level: LevelChoice,
  language: LanguageChoice,
): string {
  const levelLabel =
    level === "beginner" ? "entry-level" : level === "intermediate" ? "mid-level" : "senior";
  const focus =
    type === "technical"
      ? "technical depth, problem solving, and clear communication"
      : type === "behavioral"
        ? "collaboration, ownership, communication, and past experience"
        : "role-specific skills, past experience, and collaborative problem solving";

  if (language === "pt") {
    return `Estamos contratando uma pessoa ${levelLabel} para a posição de ${role}.

Responsabilidades:
- Colaborar com o time para entregar trabalho de alta qualidade
- Comunicar decisões com clareza e buscar feedback
- Resolver problemas com autonomia e foco no impacto
- Trabalhar com stakeholders para priorizar o que importa

Requisitos:
- Experiência relevante para a função de ${role}
- Boa comunicação e capacidade de trabalhar em equipe
- Capacidade de estruturar respostas com exemplos concretos
- Interesse em desenvolver ${focus}.`;
  }

  return `We are hiring a ${levelLabel} ${role} to join our team.

Responsibilities:
- Collaborate with the team to deliver high-quality work
- Communicate decisions clearly and invite feedback
- Solve problems with ownership and a focus on impact
- Work with stakeholders to prioritize what matters most

Requirements:
- Relevant experience for the ${role} role
- Strong communication and collaboration skills
- Ability to structure answers around concrete examples
- Interest in developing ${focus}.`;
}

export function InterviewSetup() {
  const router = useRouter();
  const { health } = useHealth();
  const [role, setRole] = useState("");
  const [type, setType] = useState<InterviewTypeChoice>("behavioral");
  const [level, setLevel] = useState<LevelChoice>("intermediate");
  const [duration, setDuration] = useState<DurationChoice>(20);
  const [language, setLanguage] = useState<LanguageChoice>("en");
  const [jobDescription, setJobDescription] = useState("");
  const [errors, setErrors] = useState<{ role?: string; jobDescription?: string; form?: string }>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);

  const persona = useMemo(() => getPersona(personaFor(type, level)), [type, level]);
  const demoInterviewer = (health?.features.avatarProvider ?? "demo") === "demo";
  const heygenIssues = health?.features.heygenIssues ?? [];
  const liveReady = Boolean(health?.features.heygen) && !demoInterviewer;
  const liveBlocked = !demoInterviewer && !liveReady;
  const demoAnalysis = health?.features.openai === false;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const cleanRole = role.trim();
    const cleanDescription = jobDescription.trim();

    if (cleanRole.length < 2) {
      nextErrors.role = "Enter the role you want to practise for.";
    } else if (cleanRole.length > 200) {
      nextErrors.role = "Keep the role under 200 characters.";
    }
    if (cleanDescription && cleanDescription.length < 80) {
      nextErrors.jobDescription = "Add a little more detail, or leave the field empty.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobTitle: cleanRole,
          jobDescription: cleanDescription || buildDescription(cleanRole, type, level, language),
          language,
          interviewType: type,
          difficulty: level,
          durationMinutes: duration,
          persona: personaFor(type, level),
        }),
      });
      const json = (await res.json()) as {
        session?: { id?: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.session?.id) {
        setErrors({ form: json.error?.message ?? "Could not create your interview. Try again." });
        return;
      }
      try {
        window.localStorage.setItem("synergy:last-interview", json.session.id);
      } catch {
        // Browser storage may be unavailable in private modes; it is optional.
      }
      router.push(`/interview/${json.session.id}`);
    } catch {
      setErrors({ form: "Network error while creating your interview. Check your connection." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span aria-hidden>←</span> Back to home
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            New practice session
          </p>
          <h1 className="mt-4 text-balance-tight text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Set up your interview.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Choose what you want to practise. You can start straight away — no account, no email,
            no onboarding.
          </p>

          <form onSubmit={onSubmit} className="mt-10 space-y-9" noValidate>
            {errors.form && (
              <Alert variant="destructive">
                <AlertTitle>Interview not created</AlertTitle>
                <AlertDescription>{errors.form}</AlertDescription>
              </Alert>
            )}

            {/* Role */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Target role</legend>
              <Input
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  if (errors.role) setErrors((current) => ({ ...current, role: undefined }));
                }}
                placeholder="e.g. Software Engineer"
                aria-label="Target role"
                aria-invalid={errors.role ? true : undefined}
                aria-describedby={errors.role ? "role-error" : "role-hint"}
                maxLength={200}
                autoComplete="off"
                className="h-11 bg-surface"
              />
              {errors.role ? (
                <p id="role-error" className="text-xs font-medium text-destructive">
                  {errors.role}
                </p>
              ) : (
                <p id="role-hint" className="text-xs text-faint">
                  Use the title of the job you are preparing for.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1" aria-label="Role suggestions">
                {ROLE_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setRole(suggestion);
                      if (errors.role) setErrors((current) => ({ ...current, role: undefined }));
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      role === suggestion
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Type */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Interview type</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Interview type">
                {TYPES.map((option) => {
                  const selected = type === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setType(option.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        selected
                          ? "border-primary/50 bg-primary-soft"
                          : "border-border bg-surface hover:border-border-strong",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{option.label}</span>
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded-full border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border-strong",
                          )}
                          aria-hidden
                        >
                          {selected && <Check className="size-2.5" strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Level */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Experience level</legend>
              <div
                className="grid grid-cols-3 rounded-xl border border-border bg-surface p-1"
                role="radiogroup"
                aria-label="Experience level"
              >
                {LEVELS.map((option) => {
                  const selected = level === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLevel(option.id)}
                      className={cn(
                        "rounded-lg px-2 py-2.5 text-center transition-colors",
                        selected
                          ? "bg-elevated text-foreground shadow-soft"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-[10px] text-faint">{option.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Duration + language */}
            <div className="grid gap-8 sm:grid-cols-2">
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Duration</legend>
                <div
                  className="flex rounded-xl border border-border bg-surface p-1"
                  role="radiogroup"
                  aria-label="Interview duration"
                >
                  {DURATIONS.map((minutes) => {
                    const selected = duration === minutes;
                    return (
                      <button
                        key={minutes}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setDuration(minutes)}
                        className={cn(
                          "flex-1 rounded-lg px-2 py-2 text-sm transition-colors",
                          selected
                            ? "bg-elevated text-foreground shadow-soft"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {minutes} min
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Language</legend>
                <div
                  className="flex rounded-xl border border-border bg-surface p-1"
                  role="radiogroup"
                  aria-label="Interview language"
                >
                  {(
                    [
                      ["en", "English"],
                      ["pt", "Português"],
                    ] as const
                  ).map(([value, label]) => {
                    const selected = language === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setLanguage(value)}
                        className={cn(
                          "flex-1 rounded-lg px-2 py-2 text-sm transition-colors",
                          selected
                            ? "bg-elevated text-foreground shadow-soft"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {/* Optional job description */}
            <details className="group rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm">
                <span>
                  Add a job description <span className="text-faint">(optional)</span>
                </span>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-border p-4">
                <Label htmlFor="job-description" className="sr-only">
                  Job description
                </Label>
                <Textarea
                  id="job-description"
                  value={jobDescription}
                  onChange={(event) => {
                    setJobDescription(event.target.value);
                    if (errors.jobDescription) {
                      setErrors((current) => ({ ...current, jobDescription: undefined }));
                    }
                  }}
                  rows={6}
                  placeholder="Paste the posting to tailor questions to the real role…"
                  aria-invalid={errors.jobDescription ? true : undefined}
                  aria-describedby={errors.jobDescription ? "jd-error" : "jd-hint"}
                  className="bg-background"
                  maxLength={20_000}
                />
                {errors.jobDescription ? (
                  <p id="jd-error" className="mt-2 text-xs font-medium text-destructive">
                    {errors.jobDescription}
                  </p>
                ) : (
                  <p id="jd-hint" className="mt-2 text-xs text-faint">
                    We only use this to shape your questions. It is never shown publicly.
                  </p>
                )}
              </div>
            </details>

            <div className="border-t border-border pt-6">
              <Button type="submit" size="lg" className="h-11 w-full px-5 sm:w-auto" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Preparing your interview…
                  </>
                ) : (
                  <>
                    Start interview
                    <ArrowRight aria-hidden />
                  </>
                )}
              </Button>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                <LockKeyhole className="size-3" strokeWidth={1.5} aria-hidden />
                No account required. Guest sessions are not saved to an account.
              </p>
            </div>
          </form>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="relative aspect-[4/3] bg-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element -- local licensed portrait */}
              <img
                src={persona.portraitSrc}
                alt={`${persona.name}, ${persona.title}, photographic interview portrait`}
                className="h-full w-full object-cover object-[50%_28%]"
                width={1000}
                height={1498}
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#07090c] via-transparent to-transparent"
                aria-hidden
              />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-sm font-medium text-white">{persona.name}</p>
                <p className="text-xs text-white/60">{persona.title}</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-faint">Your session</p>
                  <p className="mt-1 text-sm font-medium">{role.trim() || "Choose a role"}</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                  {duration} min
                </span>
              </div>
              <dl className="space-y-2.5 border-t border-border pt-4 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{TYPES.find((option) => option.id === type)?.label}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Level</dt>
                  <dd>{LEVELS.find((option) => option.id === level)?.label}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Language</dt>
                  <dd>{language === "en" ? "English" : "Portuguese (Brazil)"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Format</dt>
                  <dd className="text-right">Interview room + feedback</dd>
                </div>
              </dl>
              <div className="rounded-lg border border-border bg-background p-3">
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] font-medium",
                    liveBlocked ? "text-warning" : "text-demo",
                  )}
                >
                  {demoInterviewer
                    ? "Demo interviewer"
                    : liveBlocked
                      ? "Live interviewer — configuration required"
                      : "Live interviewer"}
                  <Sparkles className="size-3" aria-hidden />
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {demoInterviewer
                    ? "Still portrait, simulated dialogue, and browser speech. Not a live video call."
                    : liveBlocked
                      ? `The live avatar was requested but is missing: ${heygenIssues.join(", ")}. Starting a session will show the exact setup error instead of pretending live video works.`
                      : "Live avatar mode is configured for this deployment: HeyGen video, synchronized speech, and microphone conversation."}
                  {demoAnalysis ? " Feedback uses labeled demo rules." : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-faint">
            <BriefcaseBusiness className="size-3" strokeWidth={1.5} aria-hidden />
            Built for practice, not hiring decisions
          </div>
        </aside>
      </div>
    </div>
  );
}
