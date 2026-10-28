"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { INTERVIEWER_PERSONAS } from "@/lib/interview/personas";
import {
  DIFFICULTY_LABELS,
  INTERVIEW_TYPE_LABELS,
  LANGUAGE_LABELS,
  durationSchema,
  difficultySchema,
  interviewLanguageSchema,
  interviewTypeSchema,
  interviewerPersonaIdSchema,
  maxJobDescriptionChars,
  type InterviewPlan,
} from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const wizardSchema = z.object({
  jobTitle: z
    .string()
    .trim()
    .min(2, "This field is required")
    .max(200, "Job title must be 200 characters or fewer"),
  companyName: z
    .string()
    .trim()
    .max(200, "Company name must be 200 characters or fewer")
    .optional(),
  jobDescription: z
    .string()
    .trim()
    .min(80, "Paste the full job description (at least 80 characters)")
    .max(maxJobDescriptionChars, `Job description must be at most ${maxJobDescriptionChars} characters`),
  candidateBackground: z
    .string()
    .trim()
    .max(10_000, "Background must be 10,000 characters or fewer")
    .optional(),
  language: interviewLanguageSchema,
  interviewType: interviewTypeSchema,
  difficulty: difficultySchema,
  durationMinutes: durationSchema,
  persona: interviewerPersonaIdSchema,
});
type WizardValues = z.infer<typeof wizardSchema>;

const STEPS = ["Role & description", "Interview settings", "Review plan"] as const;

const STEP0_FIELDS: (keyof WizardValues)[] = [
  "jobTitle",
  "companyName",
  "jobDescription",
  "candidateBackground",
];
const STEP1_FIELDS: (keyof WizardValues)[] = [
  "language",
  "interviewType",
  "difficulty",
  "durationMinutes",
  "persona",
];

const FIELD_LABELS: Record<keyof WizardValues, string> = {
  jobTitle: "Job title",
  companyName: "Company name",
  jobDescription: "Job description",
  candidateBackground: "Your background",
  language: "Language",
  interviewType: "Interview type",
  difficulty: "Difficulty",
  durationMinutes: "Duration",
  persona: "Interviewer",
};

const SAMPLE_JD = `We are hiring a Mid-level Frontend Engineer to join our product team.

Responsibilities:
- Build and maintain React/TypeScript features across our web app
- Collaborate with design and backend engineers to deliver polished UX
- Improve performance, accessibility, and test coverage
- Participate in code reviews and technical planning

Requirements:
- 3+ years of experience with React and TypeScript
- Strong HTML/CSS fundamentals
- Experience with REST/GraphQL APIs
- Nice to have: Next.js, testing libraries, CI/CD`;

export function InterviewWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [attemptedStep, setAttemptedStep] = useState<number | null>(null);
  const [created, setCreated] = useState<{
    session: { id: string };
    plan: InterviewPlan;
    analysisMode: "ai" | "demo";
    warnings: string[];
  } | null>(null);

  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    mode: "onBlur",
    defaultValues: {
      jobTitle: "",
      companyName: "",
      jobDescription: "",
      candidateBackground: "",
      language: "en",
      interviewType: "mixed",
      difficulty: "intermediate",
      durationMinutes: 20,
      persona: "corporate_interviewer",
    },
  });

  const {
    register,
    control,
    watch,
    formState: { errors },
    getValues,
  } = form;

  const personaWatch = watch("persona");
  const selectedPersona = useMemo(
    () => INTERVIEWER_PERSONAS.find((p) => p.id === personaWatch) ?? INTERVIEWER_PERSONAS[0]!,
    [personaWatch],
  );

  const activeFields = step === 0 ? STEP0_FIELDS : step === 1 ? STEP1_FIELDS : [];
  const stepIssues =
    attemptedStep === step
      ? activeFields.flatMap((field) => {
          const message = (errors[field] as { message?: string } | undefined)?.message;
          return message ? [`${FIELD_LABELS[field]}: ${message}`] : [];
        })
      : [];

  async function buildPlan(values: WizardValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as {
        session: { id: string; plan: InterviewPlan };
        analysisMode: "ai" | "demo";
        warnings: string[];
        error?: { message?: string };
      };
      if (!res.ok) {
        setServerError(json.error?.message ?? "Could not generate the interview plan.");
        return;
      }
      setCreated({
        session: { id: json.session.id },
        plan: json.session.plan,
        analysisMode: json.analysisMode,
        warnings: json.warnings ?? [],
      });
      setStep(2);
    } catch {
      setServerError("Network error while generating the plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function nextFromStep0() {
    const ok = await form.trigger(STEP0_FIELDS, { shouldFocus: true });
    if (ok) setStep(1);
    else setAttemptedStep(0);
  }

  async function nextFromStep1() {
    const ok = await form.trigger(STEP1_FIELDS, { shouldFocus: true });
    if (ok) await buildPlan(getValues());
    else setAttemptedStep(1);
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-success text-white"
                  : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-border text-muted",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:block",
                i === step ? "font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {serverError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {stepIssues.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Fix these before continuing</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {stepIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="size-4 text-primary" aria-hidden />
              Which role are you practicing for?
            </CardTitle>
            <CardDescription>
              Paste the full job posting. We only use it to build your interview — it never contains
              instructions that can change app behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job title *</Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Frontend Engineer"
                  aria-invalid={errors.jobTitle ? true : undefined}
                  {...register("jobTitle")}
                />
                {errors.jobTitle && (
                  <p className="text-xs font-medium text-destructive">{errors.jobTitle.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company (optional)</Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Acme Inc."
                  aria-invalid={errors.companyName ? true : undefined}
                  {...register("companyName")}
                />
                {errors.companyName && (
                  <p className="text-xs font-medium text-destructive">{errors.companyName.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="jobDescription">Job description *</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    form.setValue("jobTitle", "Mid-level Frontend Engineer", { shouldValidate: true });
                    form.setValue("jobDescription", SAMPLE_JD, { shouldValidate: true });
                  }}
                >
                  Use sample posting
                </button>
              </div>
              <Textarea
                id="jobDescription"
                rows={12}
                placeholder="Paste responsibilities, requirements, nice-to-haves…"
                aria-invalid={errors.jobDescription ? true : undefined}
                {...register("jobDescription")}
              />
              <div className="flex justify-between text-xs">
                <span
                  className={
                    errors.jobDescription ? "font-medium text-destructive" : "text-faint"
                  }
                >
                  {errors.jobDescription?.message ?? "Minimum 80 characters"}
                </span>
                <span className="text-faint">
                  {watch("jobDescription")?.length ?? 0}/{maxJobDescriptionChars}
                </span>
              </div>
            </div>
            <details className="rounded-lg border border-border bg-background p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Add your background (optional)
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                A short résumé summary or notes about your experience. Used only to tailor questions.
              </p>
              <Textarea
                className="mt-3"
                rows={5}
                placeholder="e.g. 4 years React, previously at a fintech, led a design-system migration…"
                aria-invalid={errors.candidateBackground ? true : undefined}
                {...register("candidateBackground")}
              />
              {errors.candidateBackground && (
                <p className="mt-1 text-xs font-medium text-destructive">
                  {errors.candidateBackground.message}
                </p>
              )}
            </details>
            <div className="flex justify-end">
              <Button onClick={nextFromStep0}>
                Continue
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Configure the interview</CardTitle>
            <CardDescription>
              Pick the format, difficulty, and interviewer style that match your target.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Language</Label>
                <Controller
                  control={control}
                  name="language"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Interview type</Label>
                <Controller
                  control={control}
                  name="interviewType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(INTERVIEW_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Controller
                  control={control}
                  name="difficulty"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Controller
                  control={control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Duration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 minutes</SelectItem>
                        <SelectItem value="20">20 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Interviewer</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {INTERVIEWER_PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => form.setValue("persona", p.id, { shouldValidate: true })}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      personaWatch === p.id
                        ? "border-primary bg-primary-soft"
                        : "border-border hover:border-border-strong",
                    )}
                    aria-pressed={personaWatch === p.id}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-full text-sm font-semibold",
                          p.accentClass,
                        )}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.title}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{p.blurb}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-faint">
                Selected: <span className="font-medium text-foreground">{selectedPersona.name}</span>{" "}
                — live avatars require HeyGen credentials; otherwise a labeled demo interviewer is
                used.
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => { setAttemptedStep(null); setStep(0); }}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
              <Button onClick={nextFromStep1} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Building plan…
                  </>
                ) : (
                  <>
                    Generate plan
                    <Sparkles aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && created && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Interview plan</CardTitle>
              {created.analysisMode === "demo" ? (
                <Badge variant="demo">Demo analysis</Badge>
              ) : (
                <Badge variant="success">AI-generated</Badge>
              )}
            </div>
            <CardDescription>
              {created.plan.roleTitle} · {created.plan.competencies.length} competencies ·{" "}
              {created.plan.questions.length} questions · {created.plan.durationMinutes} min
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {created.warnings.map((w) => (
              <Alert key={w} variant={created.analysisMode === "demo" ? "demo" : "warning"}>
                <AlertTitle>Heads up</AlertTitle>
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}

            <div>
              <h3 className="mb-2 text-sm font-medium">Competencies</h3>
              <ul className="flex flex-wrap gap-2">
                {created.plan.competencies.map((c) => (
                  <li key={c.id}>
                    <Badge variant="secondary">{c.name}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Questions</h3>
              <ol className="space-y-3">
                {created.plan.questions.map((q) => (
                  <li
                    key={q.sequence}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm">{q.text}</p>
                      <Badge variant="outline" className="shrink-0 capitalize">
                        {q.category.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Competency: {q.competency} · {q.estimatedSeconds}s
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg bg-primary-soft p-4 text-sm text-primary">
              <p className="font-medium">Opening line</p>
              <p className="mt-1 text-foreground/80">{created.plan.openingRemarks}</p>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => { setAttemptedStep(null); setStep(1); }} disabled={submitting}>
                <ArrowLeft aria-hidden />
                Adjust settings
              </Button>
              <Button onClick={() => router.push(`/dashboard/interviews/${created.session.id}`)}>
                Enter interview room
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
