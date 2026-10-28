# Testing

## Layers

| Layer | Tool               | Command             | Status                                                         |
| ----- | ------------------ | ------------------- | -------------------------------------------------------------- |
| Unit  | Vitest 5           | `npm test`          | 142 tests, passing                                             |
| Type  | Next typegen + tsc | `npm run typecheck` | clean                                                          |
| Lint  | ESLint 9           | `npm run lint`      | 0 errors (2 informational React Compiler notes on RHF `watch`) |
| Build | Next 16 Turbopack  | `npm run build`     | passing                                                        |
| E2E   | Playwright         | `npm run test:e2e`  | not configured; Playwright and E2E specs are not installed     |

## Unit tests (`src/**/*.test.ts`)

- `state-machine.test.ts` — allowed/invalid transitions, terminal/active classification, `assertTransition` errors.
- `engine.test.ts` — time budgets, question ordering, `openingTurn`, `reconcileDecision` (finish on time/no-questions, follow-up denial paths), `applyDecision` memory mutations, `demoProposal` heuristics, weak-answer streaks.
- `schemas.test.ts` — `interviewConfigSchema` bounds/enums, `engineEventSchema`, `turnDecisionSchema`, `finalReportSchema` score bounds, `interviewPlanSchema` minimums.
- `zod-resolver.test.ts` — success/error mapping, first-error-per-field, dotted nested paths.
- `rate-limit.test.ts` — window sliding, per-key isolation, retry-after, preset sanity.
- `demo-fallback.test.ts` — seniority/competency detection, plan satisfies `interviewPlanSchema`, duration scaling, PT copy, empty-answer handling, report averaging.
- `heygen.test.ts` — HMAC bearer determinism, full `createSession` call order (contexts → secrets → llm-configurations → token), `data.id` response shapes, context/`context_id` wiring, required `avatar_id`, missing-credential errors, `getSessionStatus` (active/ended/unknown), non-throwing `stopSession`.
- `demo-auth.test.ts` — demo cookie HMAC determinism and forgery rejection, `isDemoAuthAllowed` matrix (Supabase on/off × forced demo).
- `demo/login/route.test.ts` — cookie issuance without Supabase, `409 demo_disabled` when Supabase is configured, rate limiting.
- `auth/signup/route.test.ts` — `503 not_configured` without Supabase, Supabase call with `emailRedirectTo`, friendly error mapping without leaking internals.
- `room.test.tsx` (jsdom) — portrait visible in demo, DEMO label, no SDK session in demo, speaking indicator, image-error fallback, `AvatarModeNotice` copy (en/pt), `LiveHeyGenStage` single-start + visible error, speech cleanup on unmount.
- `signup/page.test.tsx` (jsdom) — disabled real-signup + guidance + demo CTA without Supabase, visible demo errors, enabled Supabase path with confirmation step.
- `wizard.test.tsx` (jsdom) — step 0 → 1 validation, field-level errors, `aria-invalid`.
- `utils.test.ts` — duration/date/initials formatting.
- `button.test.tsx` (jsdom) — render + onClick.

## Conventions

- Node environment by default; add `// @vitest-environment jsdom` docblock for DOM/component tests.
- `server-only` is aliased to a stub in `vitest.config.ts` so server modules import cleanly.
- Provider tests stub `global.fetch` and reset env via `resetEnvCacheForTests()`.
- Component tests call `cleanup()` in `afterEach` (globals are off).

## What is intentionally not tested here

- Live OpenAI / Supabase / HeyGen network calls (no credentials in the dev environment). Provider logic is covered by mocked-HTTP tests; see `docs/avatar-integration.md` for the honest limitation.
- Automated full-browser E2E (Playwright and an E2E suite are not configured). The demo flow has been smoke-tested manually: landing → interview setup → demo interview → finish → report.

## Running

```bash
npm test              # single run
npm run test:watch    # watch mode
# npm run test:e2e    # not available until Playwright and an E2E suite are added
```
