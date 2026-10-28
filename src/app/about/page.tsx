import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteNav } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "About",
  description: "What SynergyAI is, how it works, and what the demo does and does not do.",
};

const DETAILS = [
  {
    title: "The goal",
    body: "Most interview practice is either generic or hard to access. SynergyAI is a focused rehearsal: choose a role, have a realistic conversation, and leave with feedback you can act on.",
  },
  {
    title: "How the demo works",
    body: "This deployment can run without external credentials. In that case the interviewer is a licensed still portrait with scripted dialogue and optional browser speech. Questions and feedback come from deterministic rules and are labeled as a demo — not a live avatar or a real hiring process.",
  },
  {
    title: "When providers are configured",
    body: "With an AI provider, interview plans and coaching are generated from the role and your answers. With an avatar provider, supported live video can be used. The interface always states which mode is active.",
  },
  {
    title: "Privacy by default",
    body: "No account is required to start. Guest identities are signed and anonymous, camera previews stay local, and transcripts are used to create your practice feedback.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            About the project
          </p>
          <h1 className="mt-4 max-w-3xl text-balance-tight text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
            A calmer way to prepare for the conversation.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            SynergyAI is an independent interview practice project. It is designed to make
            realistic rehearsal feel immediate, private, and useful — without an account standing
            between you and your first session.
          </p>

          <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {DETAILS.map((detail) => (
              <section key={detail.title} className="border-t border-border pt-6">
                <h2 className="text-base font-medium">{detail.title}</h2>
                <p className="mt-2.5 text-sm leading-7 text-muted-foreground">{detail.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-14 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Ready to try a session? It takes less than a minute to set up.
            </p>
            <Button asChild className="shrink-0">
              <Link href="/start">
                Start practicing
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
