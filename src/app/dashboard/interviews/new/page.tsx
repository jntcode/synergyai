import type { Metadata } from "next";
import { InterviewWizard } from "@/components/interview/wizard";

export const metadata: Metadata = { title: "New interview" };

export default function NewInterviewPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New interview</h1>
      <InterviewWizard />
    </div>
  );
}
