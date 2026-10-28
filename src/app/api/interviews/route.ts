import { NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api";
import {
  createGuestSession,
  getUserRepo,
  GUEST_COOKIE,
  guestCookieOptions,
  resolveApiUser,
  type ApiUser,
} from "@/lib/db";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createInterviewFromConfig } from "@/lib/interview/session-service";
import { isOpenAIConfigured } from "@/lib/env";


export async function GET(): Promise<NextResponse> {
  try {
    const user = await resolveApiUser();
    if (!user) return jsonError(401, "Sign in required.", "unauthorized");
    const repo = await getUserRepo(user);
    const sessions = await repo.listSessions(user.userId);
    return NextResponse.json({ sessions, mode: user.mode, ai: isOpenAIConfigured() });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let user: ApiUser | null = await resolveApiUser();
    let guestCookie: string | null = null;

    // The core product is usable without an account: issue a signed, anonymous
    // guest identity on the first interview creation. Guest data lives in the
    // in-memory repository for the preview and is never written to a shared store.
    if (!user) {
      const guest = createGuestSession();
      guestCookie = guest.value;
      user = { userId: guest.userId, mode: "guest", email: null };
    }

    const rl = checkRateLimit(`interview-create:${user.userId}`, RATE_LIMITS.interviewCreate);
    if (!rl.ok) {
      return jsonError(429, "You are creating interviews too quickly.", "rate_limited", {
        retryAfterSeconds: rl.retryAfterSeconds,
      });
    }
    const body = await request.json();
    const repo = await getUserRepo(user);
    const result = await createInterviewFromConfig(repo, user.userId, body);
    const response = NextResponse.json(
      {
        session: result.session,
        analysisMode: result.analysisMode,
        warnings: result.warnings,
        mode: user.mode,
      },
      { status: 201 },
    );
    if (guestCookie) {
      response.cookies.set(GUEST_COOKIE, guestCookie, guestCookieOptions());
    }
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
