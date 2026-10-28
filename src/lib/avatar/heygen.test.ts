import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HeyGenProvider,
  llmBearerForSession,
} from "@/lib/avatar/heygen";
import { resetEnvCacheForTests } from "@/lib/env";

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  setEnv({
    HEYGEN_API_KEY: "test-heygen-key",
    HEYGEN_AVATAR_ID: "avatar-1",
    LLM_SHARED_SECRET: "test-shared-secret",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetEnvCacheForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("llmBearerForSession", () => {
  it("is deterministic for the same session id", () => {
    const a = llmBearerForSession("session-123");
    const b = llmBearerForSession("session-123");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs per session id", () => {
    expect(llmBearerForSession("a")).not.toBe(llmBearerForSession("b"));
  });

  it("returns null when the shared secret is missing", () => {
    setEnv({ LLM_SHARED_SECRET: undefined });
    expect(llmBearerForSession("a")).toBeNull();
  });
});

describe("HeyGenProvider.createSession", () => {
  const input = {
    interviewSessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    persona: "friendly_recruiter" as const,
    language: "en" as const,
    maxSessionSeconds: 600,
    openingText: "Tell me about yourself.",
  };

  /**
   * Mocks mirror the CURRENT LiveAvatar OpenAPI response shapes: every
   * create endpoint returns its identifier as data.id.
   */
  function mockHappyFetch(calls: { url: string; body: unknown }[]) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (u.endsWith("/v1/contexts")) {
        return jsonResponse({ data: { id: "ctx_1" } });
      }
      if (u.endsWith("/v1/sessions/token")) {
        return jsonResponse({
          data: { session_id: "prov_1", session_token: "tok_123" },
        });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });
  }

  it("creates a context then mints a FULL-mode session token", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", mockHappyFetch(calls));

    const provider = new HeyGenProvider();
    const result = await provider.createSession(input);

    expect(result.provider).toBe("heygen");
    expect(result.providerSessionRef).toBe("prov_1");
    expect(result.sessionToken).toBe("tok_123");

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.liveavatar.com/v1/contexts",
      "https://api.liveavatar.com/v1/sessions/token",
    ]);

    const contextBody = calls[0]!.body as Record<string, unknown>;
    expect(contextBody.prompt).toMatch(/interviewer/i);
    expect(contextBody.prompt).toMatch(/interview/i); // guardrails present
    expect(contextBody.opening_text).toBe("Tell me about yourself.");

    const tokenBody = calls[1]!.body as Record<string, unknown>;
    expect(tokenBody.mode).toBe("FULL");
    expect(tokenBody.avatar_id).toBe("avatar-1");
    // Typed live mode uses client-driven avatar.speak_text, not a provider LLM
    // callback, so no LLM configuration or public callback URL is required.
    expect(tokenBody).not.toHaveProperty("llm_configuration_id");
    const persona = tokenBody.avatar_persona as Record<string, unknown>;
    expect(persona.context_id).toBe("ctx_1");
    expect(persona.language).toBe("en");
  });

  it("does not require LLM_SHARED_SECRET or a public app URL", async () => {
    setEnv({
      LLM_SHARED_SECRET: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
    });
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", mockHappyFetch(calls));

    const provider = new HeyGenProvider();
    await expect(provider.createSession(input)).resolves.toMatchObject({
      provider: "heygen",
      sessionToken: "tok_123",
    });
  });

  it("throws a clear error when HEYGEN_API_KEY is missing", async () => {
    setEnv({ HEYGEN_API_KEY: undefined });
    const provider = new HeyGenProvider();
    await expect(provider.createSession(input)).rejects.toThrow(/HEYGEN_API_KEY/);
  });

  it("throws a clear error when HEYGEN_AVATAR_ID is missing (required by the API)", async () => {
    setEnv({ HEYGEN_AVATAR_ID: undefined });
    const provider = new HeyGenProvider();
    await expect(provider.createSession(input)).rejects.toThrow(/HEYGEN_AVATAR_ID/);
  });

  it("surfaces HeyGen HTTP errors with the status code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "bad key" }, 401)),
    );
    const provider = new HeyGenProvider();
    await expect(provider.createSession(input)).rejects.toThrow(/401/);
  });

  it("propagates a context creation failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith("/v1/contexts")) return jsonResponse({ message: "bad" }, 422);
        return jsonResponse({ error: "unexpected" }, 500);
      }),
    );
    const provider = new HeyGenProvider();
    await expect(provider.createSession(input)).rejects.toThrow(/context create failed \(422\)/);
  });

  it("throws when the token response is missing fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith("/v1/contexts")) return jsonResponse({ data: { id: "c" } });
        return jsonResponse({ data: {} });
      }),
    );
    const provider = new HeyGenProvider();
    await expect(provider.createSession(input)).rejects.toThrow(/session_id/);
  });
});

describe("HeyGenProvider.stopSession", () => {
  it("does not throw when the stop call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "nope" }, 500)),
    );
    const provider = new HeyGenProvider();
    await expect(provider.stopSession("prov_1")).resolves.toBeUndefined();
  });

  it("does not throw when the network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const provider = new HeyGenProvider();
    await expect(provider.stopSession("prov_1")).resolves.toBeUndefined();
  });
});

describe("HeyGenProvider.getSessionStatus", () => {
  it("reports active when the session entry has no end_at", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: { id: "prov_1", duration: 12 } })),
    );
    const provider = new HeyGenProvider();
    await expect(provider.getSessionStatus("prov_1")).resolves.toBe("active");
  });

  it("reports ended when the session entry has end_at", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ data: { id: "prov_1", end_at: "2026-01-01T00:00:00Z" } }),
      ),
    );
    const provider = new HeyGenProvider();
    await expect(provider.getSessionStatus("prov_1")).resolves.toBe("ended");
  });

  it("reports unknown on HTTP errors and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    const provider = new HeyGenProvider();
    await expect(provider.getSessionStatus("nope")).resolves.toBe("unknown");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(provider.getSessionStatus("nope")).resolves.toBe("unknown");
  });
});

describe("HeyGenProvider meta", () => {
  it("reports configured state", async () => {
    const provider = new HeyGenProvider();
    expect(provider.id).toBe("heygen");
    expect(provider.isConfigured()).toBe(true);

    setEnv({ HEYGEN_API_KEY: undefined });
    expect(provider.isConfigured()).toBe(false);
  });
});
