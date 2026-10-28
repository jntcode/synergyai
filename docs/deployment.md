# Deployment

## Target

Any Node host that runs Next.js 16 (Vercel, Fly.io, Railway, Docker + Node 20+, etc.). Build output is standard `next build` (Turbopack).

## Environment

Set production values for the capabilities you enable (see `.env.example` and README):

- **Required for real accounts:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- **Required for real AI coaching:** `OPENAI_API_KEY` (optional: `OPENAI_MODEL`, `OPENAI_MODEL_FAST`)
- **Required for live avatar:** `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `AVATAR_PROVIDER=heygen`. Typed live mode does not need a public callback URL or `LLM_SHARED_SECRET`. Those are only for the optional provider-driven voice callback (`LLM_SHARED_SECRET` + public HTTPS `NEXT_PUBLIC_APP_URL`).
- **Required for demo cookies in production-like demo deployments:** `DEMO_SESSION_SECRET` (long random string — the dev fallback is insecure)

Missing optional vars do not crash the app; the UI shows honest "not configured" states.

## Database (Supabase)

1. Create a Supabase project.
2. Apply `supabase/migrations/00001_initial_schema.sql` (SQL editor or `supabase db push`).
3. RLS is enabled in the migration; user-owned tables policy on `auth.uid()`.
4. Put the publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the secret/service-role key in `SUPABASE_SECRET_KEY` (server only).

## Build & run

```bash
npm ci
npm run build
npm start
```

Run all gates before promoting: `npm run typecheck && npm run lint && npm test && npm run build`.

## Next 16 notes

- `cacheComponents: true` is on. Do **not** add `export const dynamic = "force-dynamic"` (incompatible). Session-scoped pages use `export const instant = false`; `/api/health` uses `await connection()`.
- `middleware.ts` is replaced by `src/proxy.ts`.

## Live avatar (HeyGen)

- Typed live mode works on localhost with only `HEYGEN_API_KEY` and `HEYGEN_AVATAR_ID`: the browser connects directly to LiveAvatar's WebRTC service and sends generated lines with `avatar.speak_text`. No inbound callback is needed.
- The optional provider-driven voice callback (not used by the typed room) does require a public HTTPS `${NEXT_PUBLIC_APP_URL}/api/interviews/[id]/llm`; use a tunnel (ngrok, cloudflared) if you wire that mode.
- After restart, `GET /api/health` must report `heygen: true`, `heygenIssues: []`, and `avatarProvider: "heygen"`. If `heygenRequested` is true while `heygen` is false, the setup page and interview room show **Setup required** and live starts return `avatar_configuration` instead of silently using the demo interviewer.
- Free-tier sessions are capped (~2 min); use a paid plan for real practice lengths.

## Scaling & ops

- **Rate limiting** is in-memory (per instance). Add a shared store (e.g., Upstash Redis) before multi-instance deployments that must enforce limits globally.
- **DemoRepo** is single-process/in-memory; it is for labeled demo mode only, not multi-instance production.
- Structured logs are JSON via `src/lib/logger.ts` (secret-scrubbed). Ship them to your log aggregator.
- No billing is implemented; the pricing page is an honest placeholder.

## CI (suggested)

```yaml
# .github/workflows/ci.yml (illustrative)
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
```
