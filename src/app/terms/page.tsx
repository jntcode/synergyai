import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using the SynergyAI interview practice preview.",
};

const SECTIONS = [
  {
    title: "A practice tool",
    body: "SynergyAI is an interview practice product. Sessions, questions, scores, and feedback are simulations intended to help you prepare. They are not hiring decisions, professional career advice, or guarantees of performance.",
  },
  {
    title: "Demo and live modes",
    body: "Some deployments run without AI or avatar credentials. Those sessions are clearly labeled as demos and use deterministic questions, a still portrait, and rule-based feedback. A demo is not a live AI video call. Where live providers are configured, their own terms and privacy practices also apply.",
  },
  {
    title: "Your conduct",
    body: "Use the product lawfully and respectfully. Do not submit other people's confidential information, attempt to disrupt the service, or present practice feedback as an official assessment.",
  },
  {
    title: "No account required",
    body: "You may start a guest session without registering. Guest sessions are ephemeral on this deployment and may not survive a server restart. Creating an account is optional and, when available, is governed by the same practice-only limitations.",
  },
  {
    title: "Availability and changes",
    body: "This preview may change or be unavailable at any time. Feedback quality depends on the answers you provide and the providers configured for the deployment.",
  },
] as const;

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Legal</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Terms</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            The short version: this is a practice product, not a hiring system.
          </p>
          <p className="mt-3 text-xs text-faint">Last updated: October 2026</p>

          <div className="mt-12 space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title} className="border-t border-border pt-7">
                <h2 className="text-lg font-medium tracking-[-0.01em]">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted-foreground">
              Questions about these terms or the project? Read more{" "}
              <Link href="/about" className="text-foreground underline underline-offset-4">
                about SynergyAI
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
