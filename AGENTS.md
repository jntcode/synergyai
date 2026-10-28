# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this product is

SynergyAI: AI interview **practice**. Job description → plan → live/demo AI interviewer → evidence-based coaching report. Explicitly **not** a hiring system. Demo/offline behavior must always be labeled honestly — never present heuristics as AI, never present a placeholder as a live avatar.

## Commands

```bash
npm run typecheck     # MUST pass
npm run lint          # MUST pass (warnings allowed only for react-hooks/incompatible-library on RHF watch)
npm test              # MUST pass (vitest)
npm run build         # MUST pass (Next 16, cacheComponents)
npm run format        # prettier --write
```

Run all four gates before declaring work done.

## Stack & conventions

- Next.js 16 App Router with `cacheComponents: true`. **Do not add `export const dynamic = "force-dynamic"`** — it is incompatible. For routes that must render at request time (cookies, `request.url`), use `export const instant = false`. For GET handlers that must reflect runtime env, `await connection()` from `next/server`.
- Route handler params are Promises: `context: { params: Promise<{ id: string }> }` → `const { id } = await params`.
- React 19, TypeScript strict, path alias `@/*` → `src/*`.
- Tailwind v4 with design tokens in `src/app/globals.css`. UI primitives in `src/components/ui/` (Radix + CVA). Prefer extending those primitives over one-off markup.
- Forms: `react-hook-form` + `zod` v4 with our own `zodResolver` (`src/lib/forms/zod-resolver.ts`). Do **not** add `@hookform/resolvers` (peer conflict on effect@4).
- State: plain fetch + hooks (`src/lib/hooks.ts`). No TanStack Query.
- Zod schemas for all AI structured outputs live in `src/lib/ai/schemas.ts`; convert with `toStrictJsonSchema` for OpenAI strict mode.
- The interview engine (`src/lib/interview/engine.ts`) is authoritative. LLM/demo proposals go through `reconcileDecision` before being spoken or persisted.
- Persistence goes through the `DataRepo` interface (`src/lib/db/`). Never call Supabase from components; never leak the secret key to the client. Ownership is checked server-side even when RLS is enabled.
- Env access only via `src/lib/env.ts` helpers (feature-detection, no hard crashes on missing vars).
- Logging via `src/lib/logger.ts` (structured JSON, secret-scrubbed). Never `console.log` in server code.
- Rate limits via `src/lib/rate-limit.ts` (`RateLimitHttpError` → 429 through `handleRouteError`).

## Brand & tone

- Product name is **SynergyAI** (`src/lib/brand.ts`). (Older notes may say "InterviewAI" — do not reintroduce it in UI copy.)
- Voice: practical, warm, direct. Coach-like, not judgmental. No corporate jargon, no gendered assumptions, no appearance/accent commentary.
- Every AI or demo surface must carry an honest label (badge or disclosure text).

## Testing

- Unit tests: `src/**/*.test.ts`, vitest, node environment by default. `server-only` is aliased to a stub in `vitest.config.ts`.
- Component tests: add `// @vitest-environment jsdom` docblock at the top of the file.
- Mock `fetch` for provider tests (see `src/lib/avatar/heygen.test.ts`). Reset env with `resetEnvCacheForTests()`.

## Security rules (non-negotiable)

- Never commit real keys. `.env.example` only documents variable names/shapes.
- `LLM_SHARED_SECRET` (optional provider-driven voice callback) and `DEMO_SESSION_SECRET` are server-only. The LLM bearer is derived (HMAC), never stored. Typed live avatar mode needs only `HEYGEN_API_KEY` + `HEYGEN_AVATAR_ID`.
- Demo cookies are HMAC-signed and cleared on logout; demo mode is single-process and must be labeled.
- User data deletion (`DELETE /api/settings/data`) must remove all interview artifacts for the requesting user.

## When changing providers or adding features

1. Update `docs/implementation-plan.md` and the relevant doc (`docs/avatar-integration.md`, `docs/architecture.md`).
2. Keep the demo fallback path working and labeled.
3. Extend tests before or with the change; run all four gates.
