import { NextResponse } from "next/server";
import { handleRouteError, requireUser } from "@/lib/api";
import { getUserRepo } from "@/lib/db";


/**
 * Delete all interview data for the signed-in user (interviews, questions,
 * answers, evaluations, reports, transcripts, job descriptions). Auth account
 * itself is removed via Supabase when available (client calls signOut after).
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const repo = await getUserRepo(user);
    await repo.deleteAllUserData(user.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
