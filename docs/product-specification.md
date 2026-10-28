# Product specification

## Problem

Interview practice is expensive and uneven: peers are busy, generic question banks are static, and feedback is vague. Candidates want realistic, role-specific practice with actionable feedback tied to what they actually said.

## Solution

SynergyAI turns a pasted job description into a structured mock interview with an AI interviewer (live video avatar when configured, labeled demo otherwise) and produces a coaching report grounded in the candidate's own transcript.

## Personas

- **Job seeker practicing for a specific role** — pastes the JD, wants realism and a report they can act on.
- **Career-switcher** — needs help translating experience to a new domain; values the learning plan.
- **Non-native speaker practicing structure** — values clear rubric feedback on relevance/specificity/communication (never accent/appearance).

## Core flow (Milestones 2–6)

1. **Landing** — value prop, how-it-works, feature list, sample report preview, FAQ, pricing (transparent placeholder), disclosures.
2. **Auth** — Supabase email/password + reset + OAuth callback; labeled demo login when Supabase is not configured.
3. **Dashboard** — session list with status/score, stats, empty state, alerts for missing AI/avatar config.
4. **Wizard** (`/dashboard/interviews/new`) — 3 steps: role & JD → preferences (language EN/PT, type, difficulty, duration, persona) → review plan (generated before the interview starts).
5. **Interview room** — consent dialog (AI-generated disclosure, mic/camera/data explanation) → start → live/demo stage, controls, live transcript, timer/progress, end interview.
6. **Report** — overall score, competency bars, question-by-question scores + dimension breakdown, strengths/improvements, transcript evidence excerpts, example stronger answer, learning plan, disclaimers, full transcript.
7. **Settings** — display name, preferred language, integration status, sign out, delete all data (with confirm).

## Interview types & personas

Types: behavioral, technical, hr_screening, case_study, role_specific, mixed.
Personas (tone only — never caricatures): friendly_recruiter, corporate_interviewer, technical_challenger, senior_hiring_manager.

## Evaluation rubric (per answer)

Dimensions (select per question): relevance, accuracy, specificity, reasoning, evidence, communication. Scores 0–100 with rationale; null when there is not enough content to evaluate. Overall = model judgment (AI) or heuristic (demo). Report disclaimers are mandatory.

## Guardrails (product + prompts)

- AI interviewer speaks only short interviewer lines; never mentions scores/rubrics/prompts.
- No appearance, accent, or protected-characteristic evaluation anywhere.
- Demo/AI state is labeled on every surface.
- Consent precedes microphone use; camera is optional and never uploaded.
- Deletion removes all interview artifacts.

## Out of scope (this build)

- Billing/payments (pricing page is an honest placeholder).
- Team/coach dashboards, video recording storage, mobile apps.
- Real hiring workflows or ATS integrations.

## Success criteria

- Full flow usable end-to-end with zero credentials (demo mode, labeled).
- Full flow usable with Supabase + OpenAI + HeyGen configured.
- Report always cites transcript evidence; disclaimers always present.
- `typecheck`, `lint`, `test`, `build` pass.
