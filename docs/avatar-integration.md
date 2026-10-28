# Avatar integration (HeyGen LiveAvatar)

## Decision

**Selected: HeyGen LiveAvatar (FULL mode) with client-driven speech.** Evaluated against Tavus CVI (not selected — different conversational model, less direct control of the interview loop). Research date: October 2026.

Why this shape:
- SynergyAI keeps the interview loop authoritative: our server generates every interviewer line.
- The candidate types answers (reliable input surface). The browser sends each generated line to the connected avatar with the documented `avatar.speak_text` event (`session.repeat(text)` in the SDK).
- The provider still owns the real-time TTS, lip-sync, and WebRTC audio/video. Nothing is simulated with CSS or a still image.
- Only `HEYGEN_API_KEY` and `HEYGEN_AVATAR_ID` are required. No public HTTPS callback and no provider-managed LLM configuration.
- One `HEYGEN_AVATAR_ID` is used for every interviewer persona; the selected persona changes the generated dialogue and on-screen name, not the avatar's appearance. Choose the avatar ID accordingly.
- The optional custom-LLM callback route remains in the codebase for a future voice mode, but typed live sessions do not use it.

## Server-side flow (`src/lib/avatar/heygen.ts`)

Base URL: `https://api.liveavatar.com` (header `X-API-KEY`).

Per interview session, on `POST /api/interviews/[id]/start` (rate-limited, 6/min):

1. **Validate setup first** — `HEYGEN_API_KEY` and `HEYGEN_AVATAR_ID` are checked before any paid provider resource is created. Incomplete setup throws `AvatarConfigurationError` with the exact missing values.
2. **Prepare the opening turn** — the engine builds the intro + first question *before* minting the provider session. It is persisted only after the provider session exists, so a failed start remains retryable without a phantom transcript row.
3. **Create a context** — `POST /v1/contexts` with `name` (≤64 chars), `prompt` = persona + guardrails + language + "all evaluation happens server-side", and `opening_text` = the prepared opening question. The avatar speaks this line as soon as the stream connects. Returns `{ data: { id } }`. Without a context, the avatar runs in "restricted mode".
4. **Mint a FULL-mode session token** — `POST /v1/sessions/token` with `mode: "FULL"`, `avatar_id` (**required** — we use `HEYGEN_AVATAR_ID`; find public avatars via `GET /v1/avatars/public`), `interactivity_type: "CONVERSATIONAL"`, `max_session_duration`, `video_settings: { quality: "high", encoding: "H264" }`, and `avatar_persona: { context_id, language }`. Returns `{ data: { session_id, session_token } }`. No `llm_configuration_id` is sent.
5. Stop: `POST /v1/sessions/stop` (best-effort; never throws to the caller).
6. Status: `GET /v1/sessions/{id}` — a session entry with `end_at` is reported as `ended`; any HTTP/network error reports `unknown`.

Provider failures leave the interview status at `ready` (not `connecting`). A configuration failure returns HTTP 502 with `code: "avatar_configuration"`, a non-secret `details` list, and the FULL-mode docs URL; the room shows that list and a **"Continue with demo"** action. The client may also force demo mode by posting `{ "provider": "demo" }` to the start endpoint.

**Resource note:** each live start creates a context and a provider session. Contexts are not deleted on finish; sessions on the same interview do not reuse them. Budget accordingly on paid tiers.

## Browser-side flow (`src/components/interview/use-heygen-session.ts`)

- `new LiveAvatarSession(sessionToken, { autoKeepAlive: true })` — deliberately **no `voiceChat` config**, so the provider's microphone/voice-chat pipeline never starts in typed mode.
- Events wired: `SessionEvent.SESSION_STATE_CHANGED` (`CONNECTED` / `DISCONNECTED`), `SESSION_STREAM_READY` (attach the real remote audio+video tracks to our `<video>`; the SDK requires both), `SESSION_DISCONNECTED`, `AgentEventsEnum.AVATAR_SPEAK_STARTED/ENDED`, `AVATAR_TRANSCRIPTION`, and `SESSION_STOPPED`.
- `speak(text)` checks `session.state === SessionState.CONNECTED`, interrupts any prior line, then sends `session.repeat(text)` (`avatar.speak_text`). Success is reported only after the command is accepted; if the session is not connected the room shows a real error instead of pretending the question was spoken.
- `waitForSpeechEnd()` resolves on `AVATAR_SPEAK_ENDED` (or a timeout), so a final closing line can be heard before the room stops the stream.
- Video starts muted for browser autoplay compatibility. A visible sound control unmutes it on a user gesture. Audio autoplay being blocked is surfaced honestly rather than hidden.
- Reconnect stops the browser session and calls `POST /start` again to mint a fresh single-use token; the current question is repeated through the context `opening_text`.
- No microphone is requested in typed live mode.

## Typed turn pipeline (`src/lib/interview/session-service.ts`)

`POST /api/interviews/[id]/turn` is used by both demo and live typed sessions:

1. Append the candidate answer to the repo and transcript.
2. Load the **full persisted transcript** (compacted only after 40 turns or 2,000 chars per turn).
3. Build the model request with role title, interview type, difficulty, competencies, current question, the engine-selected next planned question, already-asked questions, and timing.
4. Ask the model for one turn (`acknowledge`, `follow_up`, `next_question`, `clarify`, or `finish`).
5. Run `reconcileDecision` so time/budget/follow-up rules always win.
6. For `next_question`, use the model's contextual `spokenText` (it reacts to the answer and asks the planned question); fall back to plan text only if blank. Acknowledgements are converted into a next question so the candidate is never left without a prompt.
7. Persist the interviewer line and return the event with `turnMode: "ai" | "demo"`.

If OpenAI is not configured or the call fails, the route falls back to the labeled demo heuristic for that turn. `turnMode` tells the UI which path was used.

## Custom LLM endpoint (`/api/interviews/[id]/llm/chat/completions`) — optional

This route remains for a future provider-driven voice mode. HeyGen calls it in OpenAI chat/completions shape. Auth: `Authorization: Bearer <derived-hmac>`; verified with timing-safe compare against `llmBearerForSession(sessionId)`. It requires `LLM_SHARED_SECRET` and a public HTTPS `NEXT_PUBLIC_APP_URL`. Typed live sessions never configure or call it.

## Honest limitations

- No HeyGen credentials were available in the development environment; the provider is unit-tested with mocked `fetch` (`src/lib/avatar/heygen.test.ts`) and the browser flow with a mocked SDK (`src/components/interview/room.test.tsx`), but not exercised against a real account.
- Free tier caps sessions at ~2 minutes; meter longer sessions on a paid plan.
- Without `HEYGEN_API_KEY` or `HEYGEN_AVATAR_ID`, `AVATAR_PROVIDER=heygen` fails explicitly: the room reports **Setup required** before starting and the start endpoint returns `avatar_configuration` with the missing variable names. It never silently falls back to demo; the user can choose **Continue with demo**.
- Voice input for live sessions is **not implemented** in this path. Typed answers are the supported input; adding speech-to-text is separate work.
- The latest generated line is spoken after the server responds, so there is a short thinking pause between the candidate's answer and the avatar's reply. This is intentional and shown in the UI.

## Adding another provider

Implement `AvatarProvider` (`src/lib/avatar/types.ts`): `isConfigured`, `createSession`, `stopSession`, `getSessionStatus`. Register in `src/lib/avatar/index.ts` behind `activeAvatarProvider()`. The room UI keys off `session.avatarProvider`; keep demo labeling intact. A new provider must expose an equivalent client-side speech method or extend the room's stage contract.
