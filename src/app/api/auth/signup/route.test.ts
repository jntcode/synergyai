import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/signup/route";
import { resetEnvCacheForTests } from "@/lib/env";
import { resetRateLimits } from "@/lib/rate-limit";

const ORIGINAL_ENV = { ...process.env };

const signUpMock = vi.fn();
const upsertMock = vi.fn(async () => ({}));

vi.mock("@/lib/db", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signUp: signUpMock },
    from: () => ({ upsert: upsertMock }),
  })),
}));

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

let ipCounter = 0;
function signupRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `signup-test-${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setEnv({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
  });
  signUpMock.mockReset();
  resetRateLimits();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetEnvCacheForTests();
});

describe("POST /api/auth/signup", () => {
  it("returns 503 with guidance when Supabase is not configured", async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
    const res = await POST(
      signupRequest({ email: "a@b.com", password: "password123" }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("not_configured");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("uses Supabase Auth when configured and reports email confirmation", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    const res = await POST(
      signupRequest({ email: "a@b.com", password: "password123", displayName: "Ana" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; needsEmailConfirmation: boolean };
    expect(json.ok).toBe(true);
    expect(json.needsEmailConfirmation).toBe(true);
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "a@b.com",
        password: "password123",
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining("/auth/callback"),
        }),
      }),
    );
  });

  it("maps 'user already exists' to an actionable message without internals", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "user_already_exists", message: "User already registered" },
    });
    const res = await POST(signupRequest({ email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toMatch(/already exists/i);
    expect(json.error.message).not.toMatch(/User already registered/);
  });

  it("hides unrecognized Supabase error internals behind a generic message", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "unexpected_code", message: "internal stack trace xyz" },
    });
    const res = await POST(signupRequest({ email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).not.toMatch(/stack trace/);
    expect(json.error.message).toMatch(/try again/i);
  });
});
