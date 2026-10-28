import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Interview room" };
// The immersive room lives at a public route so guest and signed-in sessions
// share one full-screen experience.
export const instant = false;

export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/interview/${id}`);
}
