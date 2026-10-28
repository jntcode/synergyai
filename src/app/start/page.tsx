import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/site-chrome";
import { InterviewSetup } from "@/components/interview/setup";

export const metadata: Metadata = {
  title: "Start an interview",
  description:
    "Set up a role-specific practice interview in under a minute. No account required.",
};

export default function StartPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <InterviewSetup />
      </main>
      <SiteFooter />
    </>
  );
}
