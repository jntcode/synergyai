# Security & privacy

## Principles

1. **Practice product only** — never a hiring system; no protected-characteristic evaluation.
2. **Least data** — transcript text only; no video/audio storage by default; camera preview stays on-device.
3. **Explicit consent** — microphone/camera use is explained before the interview starts.
4. **Deletion works** — users can delete all interview data from Settings.

## Authentication

- **Production:** Supabase Auth (email/password, reset, OAuth callback). Sessions via `@supabase/ssr` cookies; server routes use `getClaims()` / user-scoped clients. Signup errors are mapped to friendly messages; raw provider internals are never returned.
- **Demo mode:** HMAC-signed cookie (`DEMO_SESSION_SECRET`, `DEMO_USER_ID`) issued by `POST /api/demo/login`, cleared on logout. Single-process, in-memory data. Always labeled "Demo mode" in the UI. The cookie is cryptographically unforgeable without the server secret (see `demo-auth.test.ts`).
- **Demo never shadows real auth:** the demo cookie is honored only when Supabase is **not** configured, unless `NEXT_PUBLIC_DEMO_MODE` explicitly forces demo (`isDemoAuthAllowed` in `src/lib/env.ts`). `POST /api/demo/login` returns `409 demo_disabled` when Supabase is configured and demo is not forced; the login/signup pages hide or disable the demo CTA in that case.
- `src/proxy.ts` (Next 16 middleware) refreshes sessions and redirects unauthenticated `/dashboard/*` traffic; demo cookie is a fallback only when Supabase is not configured.

## Authorization & data isolation

- Every repo call is user-scoped (`getUserRepo(user)`); Supabase RLS policies enforce `auth.uid() = user_id` on all user-owned tables.
- When a system-scoped client (secret key) is used, ownership is re-checked server-side in `SupabaseRepo` before returning or mutating rows.
- The HeyGen LLM callback authenticates with a derived HMAC bearer; a session can only affect its own interview record.

## Secrets

- Server-only env: `SUPABASE_SECRET_KEY` (or legacy service role), `OPENAI_API_KEY`, `HEYGEN_API_KEY`, `LLM_SHARED_SECRET` (optional voice callback), `DEMO_SESSION_SECRET`.
- `LLM_SHARED_SECRET` never leaves the server; the per-session bearer is derived (HMAC), not stored.
- Client-safe env is `NEXT_PUBLIC_*` only (Supabase publishable URL/key, app URL, demo-mode flag).
- `src/lib/logger.ts` scrubs known secret patterns from structured logs. No `console.log` in server code.
- `.env.example` documents names/shapes only; real `.env.local` is git-ignored.

## Rate limiting

In-memory sliding window (`src/lib/rate-limit.ts`) on AI-heavy, AI-turn, interview-create, interview-start, and demo-login endpoints → `429` with `retryAfterSeconds`. Per-instance only; add a shared store (e.g., Upstash Redis) before multi-instance deployment.

## Data handling

| Data | Stored | Notes |
| --- | --- | --- |
| Job description text | Yes (per user) | Used to generate plan; deletable |
| Interview plan / questions | Yes | |
| Transcript segments | Yes | Text only; powers report |
| Answers | Yes | Text; source labeled (avatar_stt / typed / demo_text) |
| Evaluations / report | Yes | Scores + evidence excerpts from transcript |
| Webcam video | **No** | Local preview only; never uploaded |
| Microphone audio | HeyGen (live mode) | Transcribed by provider per their DPA; we persist text only |
| Usage events | Aggregate counts | No transcript content |

`DELETE /api/settings/data` removes all interview artifacts for the requesting user. Supabase auth account removal is handled client-side after sign-out where applicable.

## Prompt guardrails

Interviewer system prompts (`src/lib/ai/prompts.ts`) forbid mentioning scores/rubrics, restrict to short interviewer lines, and include product guardrails (no appearance/accent commentary, practice-only framing).

## Reporting a concern

Open an issue at https://github.com/anomalyco/opencode/issues (or your fork's issue tracker) with severity and reproduction steps. Do not include real credentials or live session tokens in reports.
