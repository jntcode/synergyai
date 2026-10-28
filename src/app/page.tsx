import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CameraOff,
  Check,
  Mic,
  PhoneOff,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteNav } from "@/components/site-chrome";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description:
    "Practice job interviews with a realistic AI interviewer. Role-specific questions and actionable feedback, with no account required.",
};

const STEPS = [
  {
    number: "01",
    title: "Choose your interview",
    body: "Select a target role, interview type, experience level, and how long you want to practice.",
  },
  {
    number: "02",
    title: "Practice with AI",
    body: "Answer realistic questions in a focused interview room. Use typed answers, or speak naturally in live mode.",
  },
  {
    number: "03",
    title: "Get actionable feedback",
    body: "Review strengths, clear areas to improve, and concrete suggestions for building stronger answers.",
  },
] as const;

const FEATURES = [
  {
    title: "Realistic practice",
    body: "A calm, full-screen interview room with a professional interviewer, session timer, question progress, and optional camera preview.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Role-specific questions",
    body: "Questions are shaped around the role and interview type you choose, so you practise the conversation in front of you.",
    icon: BarChart3,
  },
  {
    title: "Personalized feedback",
    body: "Finish with a readable coaching report: what worked, what to sharpen, and example answers you can learn from.",
    icon: Check,
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:pb-28 lg:pt-28">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
            <div className="min-w-0">
              <p className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                AI interview practice
              </p>
              <h1 className="text-balance-tight max-w-[12ch] text-[clamp(3.15rem,7.2vw,5.5rem)] font-semibold leading-[0.96] tracking-[-0.055em]">
                Practice interviews.
                <span className="block text-muted-foreground">Build confidence.</span>
              </h1>
              <p className="mt-7 max-w-[34rem] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Realistic interview practice, powered by AI. Prepare for your next opportunity with
                personalized questions and actionable feedback — no account required.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="h-11 w-full px-5 sm:w-auto">
                  <Link href="/start">
                    Start an interview
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="h-11 w-full px-4 text-muted-foreground hover:text-foreground sm:w-auto"
                >
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>
              <p className="mt-5 text-xs text-faint">Free to try · No account required</p>
            </div>

            <InterviewPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                How it works
              </p>
              <h2 className="mt-4 text-balance-tight text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Three steps. One honest rehearsal.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                No onboarding maze. Set up a practice session in under a minute and get straight to
                the conversation.
              </p>
            </div>

            <ol className="mt-14 grid gap-10 border-t border-border pt-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step) => (
                <li key={step.number} className="border-l border-border pl-5 first:border-l-0 first:pl-0 sm:first:border-l sm:first:pl-5">
                  <span className="font-mono text-xs tracking-[0.12em] text-faint">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-base font-medium tracking-[-0.01em]">{step.title}</h3>
                  <p className="mt-2.5 max-w-sm text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-border bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-20">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                  Built for focus
                </p>
                <h2 className="mt-4 text-balance-tight text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  Everything you need. Nothing in the way.
                </h2>
                <p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground">
                  A deliberate practice space designed to feel closer to the real conversation than
                  a questionnaire.
                </p>
              </div>

              <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {FEATURES.map((feature) => (
                  <article key={feature.title} className="bg-surface p-6 sm:min-h-56">
                    <feature.icon className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
                    <h3 className="mt-8 text-sm font-medium">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
                  </article>
                ))}
              </div>
            </div>
            <p className="mt-10 text-xs leading-5 text-faint">
              When AI or avatar providers are not configured, interviews are clearly labeled as a
              demo and use deterministic questions and feedback. Live video is never simulated.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-elevated px-6 py-12 sm:px-12 sm:py-16">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
              aria-hidden
            />
            <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <h2 className="text-balance-tight text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  Ready for your next interview?
                </h2>
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  Choose a role, meet your interviewer, and leave with feedback you can use. No
                  account needed.
                </p>
              </div>
              <Button asChild size="lg" className="h-11 w-full shrink-0 px-5 sm:w-auto">
                <Link href="/start">
                  Start practicing
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function InterviewPreview() {
  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lift">
        <div className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="truncate">Practice session</span>
            <span className="text-border-strong" aria-hidden>
              /
            </span>
            <span className="truncate text-faint">Frontend Engineer</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              09:42
            </span>
            <span className="hidden text-faint sm:inline">Q2 / 6</span>
          </div>
        </div>

        <div className="relative aspect-[4/3.35] overflow-hidden bg-elevated sm:aspect-[4/3]">
          {/* eslint-disable-next-line @next/next/no-img-element -- local licensed portrait */}
          <img
            src="/interviewers/avery.jpg"
            alt="Avery, a professional interviewer, photographed in an office setting"
            className="absolute inset-0 h-full w-full object-cover object-[50%_30%]"
            width={1000}
            height={1498}
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#07090c] via-[#07090c]/15 to-transparent"
            aria-hidden
          />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
            <div className="rounded-lg border border-white/10 bg-[#0b0d10]/85 px-3 py-2">
              <p className="text-xs font-medium text-white">Avery</p>
              <p className="mt-0.5 text-[10px] text-white/65">Friendly recruiter</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0d10]/85 px-2.5 py-1.5">
              <span className="flex items-end gap-0.5" aria-hidden>
                {[5, 9, 6, 11, 7].map((height, index) => (
                  <span
                    key={index}
                    className="w-0.5 rounded-full bg-primary"
                    style={{ height }}
                  />
                ))}
              </span>
              <span className="text-[10px] text-white/70">Speaking</span>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-20 sm:right-28">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">
              Current question
            </p>
            <p className="max-w-md text-pretty text-sm font-medium leading-6 text-white sm:text-base sm:leading-7">
              “Tell me about a project you’re proud of. What made it challenging?”
            </p>
          </div>

          <div className="absolute bottom-4 right-4 w-20 overflow-hidden rounded-lg border border-white/15 bg-[#0b0d10] sm:w-24">
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 text-white/45">
              <CameraOff className="size-4" strokeWidth={1.5} aria-hidden />
              <span className="text-[9px]">You</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground">
              <Mic className="size-3.5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground">
              <CameraOff className="size-3.5" strokeWidth={1.5} aria-hidden />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground">
              <Volume2 className="size-3.5" strokeWidth={1.5} aria-hidden />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-faint sm:inline">Demo interview</span>
            <span className="flex h-8 items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive-soft px-3 text-[10px] font-medium text-destructive">
              <PhoneOff className="size-3" strokeWidth={1.5} aria-hidden />
              End
            </span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-faint">
        Interface preview · demo interviewer shown with a still portrait
      </p>
    </div>
  );
}
