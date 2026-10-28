import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, requireUser } from "@/lib/api";
import { getUserRepo } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/env";


const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  preferredLanguage: z.enum(["en", "pt"]).optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const repo = await getUserRepo(user);
    const profile = await repo.getProfile(user.userId);
    return NextResponse.json({
      profile,
      user: { id: user.userId, email: user.email, mode: user.mode },
      authConfigured: isSupabaseConfigured(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { user, error } = await requireUser();
    if (error) return error;
    const patch = patchSchema.parse(await request.json());
    const repo = await getUserRepo(user);
    const profile = await repo.upsertProfile(user.userId, patch);
    return NextResponse.json({ profile });
  } catch (err) {
    return handleRouteError(err);
  }
}
