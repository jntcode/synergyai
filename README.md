# SynergyAI

AI interview practice. Paste a job description → generate an interview plan → practice with an AI interviewer (live HeyGen avatar when configured, clearly labeled still-photo demo interviewer otherwise) → get a coaching report.

> **Practice product only.** Interviewers are fictional practice personas. The demo uses a licensed still photograph with simulated dialogue; with HeyGen configured, live mode uses an AI avatar. Scores are coaching estimates grounded in your transcript — not hiring predictions. We never evaluate appearance, accent, or other protected characteristics. Billing is not implemented.

## Features

- Job-description-driven interview plans with role, interview type, experience level, duration, and language.
- No-account guest practice with a signed, `httpOnly` cookie; optional Supabase-backed accounts when configured.
- A typed interview room with a server-persisted transcript, contextual follow-ups, progress tracking, and reconnect handling.
- A real HeyGen LiveAvatar FULL-mode video stream when credentials are configured, and a clearly labeled still-photo demo interviewer otherwise.
- Transcript-grounded coaching reports with demo/AI scores labeled honestly; no fabricated achievements or metrics.
- Interview sessions in English or Brazilian Portuguese, with the same demo flow available without paid credentials.

## Prerequisites

- **Node.js 20.9 or newer** (CI uses Node 22; the app was verified locally on Node 24).
- **npm** with the committed `package-lock.json`; use `npm ci` for reproducible installs.
- Optional service accounts: Supabase (real accounts), OpenAI (AI-generated turns and coaching), HeyGen LiveAvatar (live avatar). None are required for demo mode.

## Quick start

```bash
npm ci
cp .env.example .env.local   # optional — the app runs in labeled demo mode with no env vars
npm run dev                  # http://localhost:3000
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

With no credentials configured you can still run the full product flow via **demo mode**: heuristic job analysis, simulated interview questions, and a photographic demo interviewer (typed answers, optional browser speech) badged "DEMO — SIMULATED AI INTERVIEW", ending in a demo-labeled report. Real signup is disabled until Supabase is configured — the sign-up page explains exactly which variables to set.

## Practice without an account

The primary flow needs no account, email, or onboarding:

1. Open `/start` and choose a role, interview type (Behavioral, Technical, General), experience level, duration, and language.
2. Start the room at `/interview/[id]`. Accept the simulation consent, optionally enable a **local-only** camera preview, then answer by typing. In demo mode the interviewer's lines are spoken with browser speech and shown as captions; in live mode the HeyGen avatar speaks them. Typed input is intentionally the only answer path in live mode.
3. End the interview to see the feedback report at `/interview/[id]/report`.

The first interview request issues a signed, `httpOnly`, `SameSite=Lax` guest cookie (`synergy_guest_session`, 7 days). The cookie maps to the in-memory demo repository; **no account is created**, and guests can only read sessions created by their own cookie. Guest sessions are ephemeral — they disappear when the server process restarts and are not shared across instances. Reports therefore remain available only in the same browser/session until the process restarts.

### Routes

| Route                          | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `/`                            | Public landing page                                |
| `/start`                       | Compact one-page interview setup                   |
| `/interview/[id]`              | Full-screen practice room and consent flow         |
| `/interview/[id]/report`       | Guest feedback report (no account)                 |
| `/about`, `/privacy`, `/terms` | Product, privacy, and terms pages                  |
| `/dashboard/*`                 | Retained account flow and signed-in report history |

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest (unit + component tests)
npm run build       # next build (Turbopack, cacheComponents)
```

`npm run test:e2e` is reserved for automated browser coverage. Playwright and an E2E suite are not currently configured or committed; the demo flow has been smoke-tested manually.

## Configuration

All variables are optional; see `.env.example` for the full list.

| Capability             | Variables                                                                                 | Without them                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts               | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Labeled demo login only (in-memory, single process); real signup is disabled with guidance until Supabase is set. The demo cookie is ignored once Supabase is configured (unless `NEXT_PUBLIC_DEMO_MODE` forces it). |
| AI analysis & coaching | `OPENAI_API_KEY` (models default to `gpt-6.1-sol` / `gpt-6-luna`)                         | Labeled rule-based demo heuristics                                                                                                                                                                                   |
| Live avatar            | `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `AVATAR_PROVIDER=heygen`                            | Labeled demo interviewer (typed answers + browser speech)                                                                                                                                                            |
| Demo cookie signing    | `DEMO_SESSION_SECRET`                                                                     | Insecure dev default (never use in production)                                                                                                                                                                       |

Feature state is visible in the UI (login page, dashboard alerts, interview room, settings → Integrations) and via `GET /api/health` (including a non-secret `heygenIssues` list).

## Deployment

The app builds as a standard Next.js 16 Node application. No deployment is performed as part of repository setup.

1. Use a Node 20.9+ host (Vercel, Fly.io, Railway, Docker, or another Node platform).
2. Set environment variables in the host's secret manager. At minimum, set `NEXT_PUBLIC_APP_URL` to the public HTTPS URL. Set `DEMO_SESSION_SECRET` if demo sessions will be served in production.
3. For real accounts, apply `supabase/migrations/00001_initial_schema.sql` and set the Supabase variables.
4. Build and start:

   ```bash
   npm ci
   npm run build
   npm start
   ```

5. Check `GET /api/health` and the feature badges after deployment. Live HeyGen, OpenAI, and Supabase paths still require their own credentials and were not verified against real services in this repository's test environment.

The GitHub Actions workflow at `.github/workflows/ci.yml` runs typecheck, lint, unit/component tests, and a production build on pushes to `main`/`master` and on pull requests. See [`docs/deployment.md`](docs/deployment.md) for database, avatar, CI, and scaling details.

## Live HeyGen LiveAvatar (FULL mode)

Live mode uses the official `@heygen/liveavatar-web-sdk` in **FULL mode**. The provider owns text-to-speech, lip movement, and the WebRTC video stream; SynergyAI owns the interview intelligence. The candidate types each answer, the server generates the next interviewer line from the full conversation, and the browser asks the connected avatar to speak it with the documented `avatar.speak_text` command (`session.repeat(text)`). Nothing is animated with CSS, SVGs, loops, or a static overlay.

### Required setup

1. Create a LiveAvatar API key at <https://app.liveavatar.com/developers> and list an avatar:

   ```bash
   curl https://api.liveavatar.com/v1/avatars/public -H "X-API-KEY: $HEYGEN_API_KEY"
   ```

2. Set the server-side environment:

   ```bash
   AVATAR_PROVIDER=heygen
   HEYGEN_API_KEY=...
   HEYGEN_AVATAR_ID=<avatar UUID>
   OPENAI_API_KEY=...   # recommended; without it, turns use labeled demo questions
   ```

   Typed live mode needs **only** `HEYGEN_API_KEY` and `HEYGEN_AVATAR_ID`. `NEXT_PUBLIC_APP_URL` can stay `http://localhost:3000`; a public HTTPS URL and `LLM_SHARED_SECRET` are only required by the optional provider-driven voice callback, which typed live mode does not use. `AVATAR_PROVIDER=heygen` never silently falls back to demo: an incomplete setup returns `avatar_configuration` with the exact missing variables, and the room shows that list.

3. Restart the server and confirm `GET /api/health` reports `heygen: true`, `heygenIssues: []`, and `avatarProvider: "heygen"`.

### What happens during a live session

- `POST /api/interviews/[id]/start` prepares the opening question **before** creating the provider session, so the avatar can speak it immediately (`opening_text`) instead of waiting silently.
- The server creates a per-session context (persona + guardrails) and mints a short-lived FULL-mode session token. Only the token reaches the browser; the API key never does.
- The room attaches the real remote audio/video tracks on `SESSION_STREAM_READY`. Video autoplays **muted** for browser reliability; a visible “Sound off — enable audio” control unmutes it on a user gesture.
- Each typed answer is sent to `/api/interviews/[id]/turn`. The server saves it, loads the **full persisted transcript**, asks the model for the next turn using the role, interview type, experience level, current question, and next planned question, then applies deterministic budget rules. The returned line is added to the conversation and sent to the avatar with `session.repeat`.
- The avatar's speech starts only after a successful server response. If the avatar is disconnected or the speech command fails, the room says so and offers Reconnect instead of pretending the question was spoken. When the final turn ends the interview, the room waits for the closing line to finish speaking before stopping the stream.
- On a provider disconnect, the room offers Reconnect (mints a fresh single-use token and repeats the current question) or End interview. **No microphone is used** in typed live mode.

### How to verify genuine animation and speech

1. Start a live interview with the variables above. No microphone permission prompt should appear.
2. Confirm the avatar is an actual moving video stream (not the still portrait): the badge reads **LIVE AVATAR**, and lip movement is synchronized with audible speech once you enable sound.
3. Type a detailed answer that mentions a specific project. The next line should react to that content and ask the planned follow-up or next question; a different answer should produce a different reaction. Refresh the page and confirm the transcript persisted.
4. Disconnect the network briefly: the room should show **Disconnected** rather than a frozen “connected” state. Reconnect should attach a fresh stream and repeat the current question.
5. Unset one required variable and restart: `GET /api/health` and the room should list the exact missing configuration instead of showing live video.

Live provider behavior cannot be verified in CI without HeyGen credentials; unit tests mock the documented HTTP shapes and browser SDK contract, and the live typed flow is covered with a mocked SDK (`room.test.tsx`).

## Architecture (short)

- **Next.js 16** (App Router, `cacheComponents`, `proxy.ts`), React 19, TypeScript strict, Tailwind v4.
- **Interview engine** (`src/lib/interview/engine.ts`) is authoritative: budgets, follow-up limits, and transitions are enforced server-side even when an LLM proposes the next line (`reconcileDecision`).
- **HeyGen LiveAvatar (FULL mode)** renders the interviewer video. SynergyAI generates every line server-side and the browser sends it to the avatar with the SDK's documented `avatar.speak_text` command. The optional provider-driven `/llm/chat/completions` callback remains available for voice mode but is not used by typed live sessions.
- **Data layer**: `DataRepo` interface with `SupabaseRepo` (RLS + server-side ownership checks) and in-memory `DemoRepo` for labeled demo mode.
- Provider research, milestones, and risks: [`docs/implementation-plan.md`](docs/implementation-plan.md). Full docs in [`docs/`](docs/).

## Demo mode and honest limitations

- **Demo interviews are not AI video.** The interviewer is a clearly labeled still stock portrait with simulated dialogue and browser speech — never presented as live video. Live HeyGen avatar mode requires a HeyGen API key and avatar id.
- **Demo scoring is deterministic.** Without `OPENAI_API_KEY`, questions and coaching scores come from rule-based heuristics, are labeled "Demo evaluation", and are not AI output or a human assessment. Scores are coaching estimates, not hiring predictions.
- **Typed answers in both modes.** The microphone is not captured. The optional camera is a local preview only, never uploaded. Voice input for live sessions is not implemented yet and is tracked as separate work.
- **Guest sessions are ephemeral and in-memory.** They are not an account, are not durable, and are scoped to the signed cookie. Do not rely on them for production persistence.
- **Provider integrations are not verified here.** Live OpenAI, Supabase, and HeyGen paths were not exercised against real credentials in this environment; they are unit-tested with mocked HTTP and documented in `docs/avatar-integration.md` and `docs/testing.md`.
- Rate limiting is in-memory (per instance). Pair with a shared store before enforcement that must hold across instances.
- No billing, no payments, no fake checkout.

## Photography credits

Interviewer portraits are illustrative stock photographs from [Unsplash](https://unsplash.com), used under the [Unsplash License](https://unsplash.com/license). Attribution is not required but is recorded here. The people pictured are not real SynergyAI interviewers, employees, customers, or users; the persona names are fictional.

| Persona | Unsplash image                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------- |
| Avery   | [`photo-1573496359142-b8d87734a5a2`](https://images.unsplash.com/photo-1573496359142-b8d87734a5a2) |
| Morgan  | [`photo-1560250097-0b93528c311a`](https://images.unsplash.com/photo-1560250097-0b93528c311a)       |
| Riley   | [`photo-1580894732444-8ecded7900cd`](https://images.unsplash.com/photo-1580894732444-8ecded7900cd) |
| Cameron | [`photo-1472099645785-5658abf4ff4e`](https://images.unsplash.com/photo-1472099645785-5658abf4ff4e) |
