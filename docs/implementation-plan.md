# SynergyAI — Implementation Plan (Milestone 0)

Date: 2026-10-19
Status: approved defaults applied; executed incrementally in this repository.

## 1. Environment audit

| Item | Finding |
| --- | --- |
| OS / shell | Windows 11, PowerShell 5.1 |
| Node / npm | v24.20.0 / 11.19.0 (Node 22+ required by current `openai` SDK; 24 OK) |
| Git | 2.55.0 |
| Existing project at working dir | `job-autofill` monorepo — **unrelated; preserved untouched** |
| New project location | sibling directory `../synergyai` (npm forbids capital letters in package names) |
| Network | npm registry reachable |
| Credentials available in this environment | none (OpenAI / Supabase / HeyGen) — live integrations cannot be verified here |

Consequence: the MVP ships (a) complete real integrations written against current official docs,
(b) a **clearly labeled demo mode** that exercises the full product flow without credentials, and
(c) exact documentation of what remains unverified until credentials are supplied.

## 2. Provider research summary (official docs, Oct 2026)

### HeyGen LiveAvatar — selected as primary avatar provider

- Product: **LiveAvatar** (replaces Interactive Avatar / Streaming Avatar).
- Docs: https://docs.liveavatar.com · API base: `https://api.liveavatar.com` · auth header `X-API-KEY`.
- Browser SDK: `@heygen/liveavatar-web-sdk@0.0.19` (`LiveAvatarSession`: `start/stop/keepAlive/attach/message/interrupt`;
  events `user.transcription`, `avatar.transcription`, `avatar.speak_started/ended`, `session.stopped`, …).
- Modes: **FULL** (HeyGen runs VAD → STT → LLM → TTS → WebRTC) and **LITE** (fully custom pipeline).
- Bring-your-own LLM: `POST /v1/llm-configurations` with an **OpenAI-compatible `/chat/completions`**
  `base_url` → pass `llm_configuration_id` on `POST /v1/sessions/token`. HeyGen then calls our backend
  for every interviewer utterance, keeping the interview engine fully under our control.
- Transcripts: live `user.transcription` / `avatar.transcription` events in the browser SDK — no webhook needed.
- Language: `pt` (Portuguese) supported on `GET /v1/languages`; set per session. There is no separate `pt-BR` code.
- Pricing (official): Free 10 credits/mo, 1 concurrent session, **2 min/session max**, watermark;
  Essential $99 (20 min/session, no watermark); Business $475 (60 min/session). FULL burns 2 credits/min.
- Constraints: HTTPS/localhost required; sessions end on idle/max-duration/no-credits; sandbox ≈1 min.

### Tavus CVI — evaluated, not selected

- Strong custom-LLM support (`layers.llm.base_url`, SSE `/chat/completions`), 42 languages incl. `pt`,
  embed via Daily JS or `@tavus/cvi-ui@0.3.1`. Free tier ~20–25 min/mo, 5 min max call.
- Why not primary: full transcripts require a **public callback URL** (`application.transcription_ready`)
  or live caption scraping — weaker for real-time transcript-driven evaluation; no lightweight official
  web SDK class comparable to `LiveAvatarSession` for custom UIs. Retained as a future adapter behind the
  same `AvatarProvider` interface.

### OpenAI

- Recommended API: **Responses API** (`POST /v1/responses`); Chat Completions still supported.
- Structured outputs: `text.format json_schema` (Responses) / `response_format json_schema` (Chat);
  SDK helpers `responses.parse` + `zodTextFormat`. Strict schema rules: all fields required, optionals as
  nullable unions, `additionalProperties: false`, root must be an object.
- Current general models: `gpt-6-astra` (flagship), `gpt-6.1-sol` (balanced), `gpt-6-luna` (cheapest,
  low-effort extraction). Defaults in app: `OPENAI_MODEL=gpt-6.1-sol` (planning/turns),
  `OPENAI_MODEL_FAST=gpt-6-luna` (evaluation/extraction). Overridable via env.
- npm: `openai@7.x` (Node ≥22).

### Supabase

- SSR package: **`@supabase/ssr@0.12.x`** (`auth-helpers` deprecated). Pattern: `createBrowserClient` /
  `createServerClient` with `cookies.getAll/setAll`; refresh session in **`proxy.ts`**
  (Next 16 renamed middleware → proxy); use `auth.getClaims()` server-side.
- Keys: prefer `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) + server-only
  `SUPABASE_SECRET_KEY` (`sb_secret_…`); legacy anon/service_role JWTs still accepted by the SDK.
- RLS: `auth.uid()` comparisons with `select auth.uid()`; secret key bypasses RLS — server-only.

## 3. Architecture decisions

1. **Single Next.js 16 app** (App Router, TS strict, Tailwind v4, React 19). Route Handlers own all
   privileged work; no separate backend service for the MVP; service modules stay framework-light so a
   future Spring Boot extraction is possible.
2. **Avatar provider interface** (`createSession/connect/sendMessage/interrupt/getStatus/disconnect`)
   with `HeyGenProvider` (real) + `DemoProvider` (labeled). Factory picks by env + credentials.
3. **Interview engine is authoritative.** In live mode, HeyGen FULL mode calls
   `POST /api/interviews/[id]/llm/chat/completions` (OpenAI-compatible). Our engine returns the next
   concise spoken line. A per-session HMAC bearer secret (derived from `LLM_SHARED_SECRET` + session id,
   not stored) authenticates HeyGen's calls. Internal rubric/reasoning never leaves the server; the
   avatar only ever receives spoken text.
4. **Explicit state machine** for session status + validated engine events
   (`ask_question | acknowledge | follow_up | clarify | move_on | finish`).
5. **Persistence**: Supabase Postgres with RLS on every user-owned table (`supabase/migrations`).
   When Supabase is unconfigured, a server-side **in-memory demo repository** backs a clearly labeled
   demo mode (demo user cookie, no password). Same repository interface for both.
6. **No fake success paths.** Missing credentials produce explicit "not configured" UI states and
   labeled demo behavior — never simulated live avatars or fabricated AI output.
7. **Cost controls**: duration caps (10/20/30 min), question budgets, per-user in-memory rate limits on
   AI endpoints (documented as single-instance; Upstash recommended for multi-instance), usage event log.
8. **Consent first**: explicit AI-interviewer disclosure + mic/camera consent before any capture;
   webcam preview is local-only; no raw video stored.
9. Brand: product name **SynergyAI** (from project brief); visual identity tokens centralized in
   `globals.css` / `brand.ts` so the display name is replaceable in one place.

## 4. Implementation milestones & acceptance criteria

| Milestone | Scope | Acceptance |
| --- | --- | --- |
| M1 Foundation | Next app, TS strict, Tailwind tokens, UI primitives, lint/format/CI, env validation | `npm run build`, `lint`, `typecheck` pass |
| M2 UX | Landing, pricing, auth screens, dashboard, wizard, interviewer selection, room layout | All flows navigate & validate; demo data labeled |
| M3 DB & auth | Supabase SSR clients, proxy session refresh, migrations + RLS, demo repo parity | RLS policies in SQL; protected routes; demo fallback |
| M4 AI engine | JD analysis, plan generation, adaptive turns, evaluation, report; schemas + state machine | Unit tests green; engine honors budgets/time/no-repeat |
| M5 Avatar | HeyGen token+LLM-config endpoints, SDK stage, transcript capture, demo stage | Written to current docs; mocked tests; honest live-status banner |
| M6 E2E | Wizard → start → turns (demo + live path) → finish → report persistence | Demo E2E verified locally without credentials |
| M7 Hardening | Tests, typecheck, lint, prod build, docs, security review | All automated checks pass |

## 5. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| No credentials in this environment | Demo mode + mocked unit tests; docs list exactly what is unverified |
| HeyGen free tier 2 min/session | App durations 10/20/30 min require paid tier; runtime shows provider limits; demo mode has no avatar cap |
| HeyGen calls our LLM URL → needs public HTTPS | Only applies to the optional provider-driven voice mode; typed live mode is client-driven and needs no callback |
| Serverless statelessness | All engine state in Postgres (or per-process demo store); idempotent finish |
| Per-session LLM contexts accumulate | Documented; contexts are lightweight; optional cleanup |
| OneDrive file locks on Windows | Standard Next build; if locks appear, exclude project dir from sync (documented) |
| Prompt injection via job descriptions | Treat JD text as untrusted data; system prompts isolated; no tool access from JD content |

## 6. Environment variables (see `.env.example`)

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_FAST`,
`AVATAR_PROVIDER` (`heygen` | `demo`), `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, and optionally `LLM_SHARED_SECRET` (provider-driven voice callback only).

## 7. What this environment cannot verify (honest limitations)

- Live HeyGen avatar video/audio (needs `HEYGEN_API_KEY`, paid credits, avatar id; no public callback is needed for typed live mode).
- Live OpenAI structured outputs (needs `OPENAI_API_KEY`).
- Live Supabase auth + RLS against a real project (needs project URL + keys; SQL migrations are
  written to be applied via `supabase db push` and are reviewable).
- These are exercised via: unit tests with mocked providers, the demo mode path, and documented
  manual verification steps in `docs/testing.md` and `docs/deployment.md`.
