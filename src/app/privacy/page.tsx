import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How SynergyAI handles practice sessions, transcripts, and browser data.",
};

const SECTIONS = [
  {
    title: "What we collect",
    body: [
      "Without an account, SynergyAI creates a signed, anonymous guest session. The cookie contains a random identifier and a signature; it does not contain your name, email, answers, or any interview content.",
      "When you configure an interview, we receive the role title, settings, and any optional job description you provide. As you practise, the conversation is stored as text so a feedback report can be generated.",
    ],
  },
  {
    title: "What we do not collect",
    body: [
      "In demo mode, the camera preview stays in your browser and is never uploaded or recorded. The demo interviewer does not listen through your microphone; answers are typed.",
      "We do not evaluate your appearance, accent, or protected characteristics. Practice feedback is not a hiring decision.",
    ],
  },
  {
    title: "How your data is stored",
    body: [
      "On this deployment, guest sessions are held in server memory for the preview and are cleared when the server restarts. Recent session identifiers may be stored in your browser's local storage to support the practice flow.",
      "If a production deployment uses configured database and AI providers, interview text is still processed only to deliver the practice experience described here.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can leave at any time. Starting a new practice session creates a fresh guest identity. For data questions or removal requests in a configured deployment, contact the project maintainer listed in the project repository.",
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Legal</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Privacy</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Practice should feel safe. Here is the plain-language version of what happens to your
            data when you use SynergyAI.
          </p>
          <p className="mt-3 text-xs text-faint">Last updated: October 2026</p>

          <div className="mt-12 space-y-10">
            {SECTIONS.map((section) => (
              <section key={section.title} className="border-t border-border pt-7">
                <h2 className="text-lg font-medium tracking-[-0.01em]">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
