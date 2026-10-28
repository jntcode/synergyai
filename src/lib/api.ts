import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { resolveApiUser, type ApiUser } from "@/lib/db";
import { InvalidTransitionError } from "@/lib/interview/state-machine";

export function jsonError(
  status: number,
  message: string,
  code: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function requireUser(): Promise<
  { user: ApiUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await resolveApiUser();
  if (!user) {
    return {
      user: null,
      error: jsonError(401, "Sign in required.", "unauthorized"),
    };
  }
  return { user, error: null };
}

/** Centralized handler error mapping — never leaks secrets. */
export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return jsonError(400, "Invalid input.", "validation_error", {
      issues: err.issues.slice(0, 10).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  if (err instanceof InvalidTransitionError) {
    return jsonError(409, err.message, "invalid_transition");
  }
  if (err instanceof RateLimitHttpError) {
    return jsonError(429, err.message, "rate_limited", { retryAfterSeconds: err.retryAfterSeconds });
  }
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  logger.error("api.route_error", { message });
  // Messages from our own guards are safe to surface; anything else is generic.
  const safe = /^(Supabase|HeyGen|OpenAI|Session|Interview|Cannot|Missing|Invalid|Empty|Demo)/.test(
    message,
  );
  return jsonError(500, safe ? message : "Unexpected server error.", "internal_error");
}

export class RateLimitHttpError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitHttpError";
  }
}
