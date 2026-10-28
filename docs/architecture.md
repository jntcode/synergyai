# Architecture

## System overview

```
Browser (Next.js client components)
  │  fetch (JSON)
  ▼
Next.js App Router (server components + route handlers)
  ├── src/lib/interview/     engine (authoritative), session-service (orchestration)
  ├── src/lib/ai/            schemas, prompts, OpenAI services, demo fallbacks
  ├── src/lib/avatar/        provider interface, HeyGen, demo provider
  ├── src/lib/db/            DataRepo → SupabaseRepo | DemoRepo
  └── src/lib/               env, logger, rate-limit, api helpers

External providers (all optional, feature-detected)
  ├── Supabase      accounts (RLS) + production persistence
  ├── OpenAI        analysis, plans, turn decisions, evaluation, report
  └── HeyGen        LiveAvatar FULL mode video interviewer
```

## Request flows

### Create interview (wizard)

`POST /api/interviews` → validate `interviewConfigSchema` → (AI: `analyzeJobDescription` + `generateInterviewPlan` | demo: `demoAnalyzeJob` + `demoGeneratePlan`) → persist job description + session (status `ready`) + planned questions → return plan for review.

### Interview room (demo mode)

1. `POST /api/interviews/[id]/start` → status `connecting` → demo avatar session → `openingTurn` → transcript persisted → status `in_progress`.
2. Each typed answer: `POST /api/interviews/[id]/turn` → persist answer → LLM `decideNextTurn` (or `demoProposal`) → **`reconcileDecision`** (engine wins on budgets/time) → `applyDecision` → persist interviewer event → return event.
3. `POST /api/interviews/[id]/finish` → collect answers → LLM `evaluateAnswers` + `buildFinalReport` (or demo equivalents) → persist evaluations + report → status `completed`.

### Interview room (HeyGen live mode)

1. `POST /api/interviews/[id]/start` validates the HeyGen setup (`HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`), prepares the opening question, then mints a session token bound to a per-session context:
   - `POST /v1/contexts` (persona/guardrails + `opening_text`),
   - `POST /v1/sessions/token` (FULL mode).
   Missing configuration returns `avatar_configuration` with the exact variable names.
2. Browser connects with `@heygen/liveavatar-web-sdk` (`LiveAvatarSession`, no `voiceChat` config) and attaches the real remote audio+video tracks to a `<video>` element on `SESSION_STREAM_READY`. The video starts muted until the user enables sound. Typed answers are the only input path; no microphone is captured.
3. Each typed answer uses the same `POST /api/interviews/[id]/turn` pipeline as demo mode. The returned interviewer line is shown in the transcript and spoken by the connected avatar via the documented `avatar.speak_text` command (`session.repeat`). Speech failures and disconnects are surfaced honestly.
4. Ending (user, provider stop, or time) → `POST /api/interviews/[id]/finish` → evaluation → report. The closing line is awaited before the stream is stopped. Disconnects offer a fresh-token reconnect that repeats the current question.
5. The optional provider-driven custom-LLM callback (`/llm/chat/completions`) remains for a future voice mode; typed live sessions do not configure or call it.

## Interview engine (authoritative)

`src/lib/interview/engine.ts`:

- `computeTimeBudget(durationMinutes)` → planned question count + max follow-ups.
- `reconcileDecision(ctx, proposal)` — the engine always wins: time up ⇒ finish; no questions left ⇒ finish; follow-up budget exhausted (global, per-question, or weak-answer streak) ⇒ next question instead of follow-up.
- `applyDecision` — mutates `EngineMemory` (asked questions, follow-up counters, current question) and emits a typed `EngineEvent`.
- `openingTurn` — intro + first question in one utterance.

LLM output (`turnDecisionSchema`) is validated before reconciliation. Demo mode uses `demoProposal` with the same reconciliation path.

## Persistence

`DataRepo` (`src/lib/db/demo-repo.ts` interface) is the only access path:

- `SupabaseRepo` — user-scoped client via `@supabase/ssr` (RLS `auth.uid()`), or system-scoped client with the secret key; ownership always re-checked server-side.
- `DemoRepo` — in-memory singleton for labeled demo mode (single process, lost on restart).

Tables (migration `supabase/migrations/00001_initial_schema.sql`): `profiles`, `job_descriptions`, `interview_sessions`, `interview_questions`, `interview_answers`, `interview_transcript_segments`, `interview_evaluations`, `interview_reports`, `usage_events`. All have RLS policies; indexes cover user/session lookups.

## Caching & rendering (Next 16 `cacheComponents`)

- Static: landing, pricing, auth pages, dashboard shell (client-fetched data).
- Partial prerender: `/dashboard/interviews/[id]` (+ `/report`) — static shell, dynamic session data via `export const instant = false`.
- Dynamic: all authenticated API routes (cookies), `/api/health` (`await connection()` so feature flags reflect runtime env), `/auth/callback` (`instant = false`, reads `request.url`).
- `export const dynamic = "force-dynamic"` is **not used** — incompatible with `cacheComponents`.

## Feature detection

`src/lib/env.ts` lazily validates env and exposes `isSupabaseConfigured`, `isOpenAIConfigured`, `isHeyGenConfigured`, `activeAvatarProvider`, etc. Missing credentials never crash the app; surfaces render honest "not configured" states (login, dashboard, room, settings, `/api/health`).

## Known limitations

- In-memory rate limiting is per instance.
- DemoRepo is single-process; not for multi-instance demo deployments.
- HeyGen `getSessionStatus` is `unknown` server-side (no documented status endpoint); client observes via SDK events.
- OpenAI/Supabase/HeyGen live calls were not exercised with real credentials during development; provider logic is covered by mocked-HTTP unit tests (`src/lib/avatar/heygen.test.ts`).
