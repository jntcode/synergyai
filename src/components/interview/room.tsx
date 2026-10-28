"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  MessageSquare,
  PhoneOff,
  RefreshCw,
  Send,
  Settings,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress, Skeleton } from "@/components/ui/progress";
import { cn, formatDuration } from "@/lib/utils";
import { getPersona, type InterviewerPersona } from "@/lib/interview/personas";
import {
  liveAvatarSupportIssue,
  useHeyGenSession,
  type HeyGenStatus,
} from "@/components/interview/use-heygen-session";
import { useHealth } from "@/lib/hooks";
import type { InterviewPlan, EngineEvent, InterviewLanguage } from "@/lib/ai/schemas";

interface RoomSession {
  id: string;
  status: string;
  durationMinutes: number;
  language: InterviewLanguage;
  persona: string;
  avatarProvider: string;
  plan: InterviewPlan | null;
  startedAt: string | null;
  /** Server-computed time left when resuming; avoids reading the clock during render. */
  remainingSeconds?: number;
}

interface TranscriptEntry {
  role: "interviewer" | "candidate";
  text: string;
}

interface RoomProps {
  sessionId: string;
  initialSession: RoomSession;
  initialTranscript: TranscriptEntry[];
}

type Phase =
  | "consent"
  | "starting"
  | "live"
  | "finishing"
  | "finished"
  | "error";

export function InterviewRoom({ sessionId, initialSession, initialTranscript }: RoomProps) {
  const router = useRouter();
  const { health } = useHealth();
  const resumable = initialSession.status === "in_progress" && initialSession.avatarProvider !== "heygen";
  const lastInterviewer = [...initialTranscript].reverse().find((entry) => entry.role === "interviewer");

  const [session, setSession] = useState(initialSession);
  const [phase, setPhase] = useState<Phase>(resumable ? "live" : "consent");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(initialTranscript);
  const [currentSpeech, setCurrentSpeech] = useState<string>(lastInterviewer?.text ?? "");
  const [speechActive, setSpeechActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [configIssues, setConfigIssues] = useState<string[]>([]);
  const [configDocsUrl, setConfigDocsUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(
    initialSession.remainingSeconds ?? initialSession.durationMinutes * 60,
  );
  const [camOn, setCamOn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [useSpeech, setUseSpeech] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [askedCount, setAskedCount] = useState(() =>
    Math.max(1, initialTranscript.filter((entry) => entry.role === "interviewer").length),
  );
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const persona = getPersona(session.persona as never);
  const isLive = session.avatarProvider === "heygen";
  const liveConfigured = health?.features.heygen ?? false;
  // `AVATAR_PROVIDER=heygen` with missing credentials must be surfaced before
  // the user starts — never presented as an ordinary demo session.
  const liveRequested = health?.features.heygenRequested === true;
  const liveBlocked = liveRequested && !liveConfigured;
  // Before the first start the session still carries the demo placeholder, so
  // use health config to describe the mode the user is about to enter.
  const liveWillRun =
    isLive || (health?.features.heygen === true && health?.features.avatarProvider === "heygen");
  const showDemoLabel = !isLive && (phase !== "consent" || !liveWillRun);
  const roleTitle = session.plan?.roleTitle ?? "Practice interview";

  // Keep the conversation scrolled to the newest line without moving the page
  // (important on mobile, where the room rail sits below the interviewer stage).
  useEffect(() => {
    const element = transcriptScrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [transcript, currentSpeech]);

  // Open a new room at the top; the setup CTA may have been below the fold.
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  // Countdown
  useEffect(() => {
    if (phase !== "live") return;
    const timer = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Stop any speech and release media when unmounting.
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* unsupported */
      }
      webcamStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!useSpeech || typeof window === "undefined" || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = session.language === "pt" ? "pt-BR" : "en-US";
        utterance.rate = 1.02;
        utterance.onstart = () => setSpeechActive(true);
        utterance.onend = () => setSpeechActive(false);
        utterance.onerror = () => setSpeechActive(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        /* speech synthesis unsupported */
      }
    },
    [useSpeech, session.language],
  );

  const stopSpeech = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* unsupported */
    }
    setSpeechActive(false);
  }, []);

  const pushTranscript = useCallback(
    (role: "interviewer" | "candidate", text: string) => {
      // The server persists demo turns and live LLM-callback turns. The client
      // only mirrors them. Transcription events can arrive cumulatively, so
      // collapse an identical/prefix-extending adjacent line instead of
      // rendering duplicate or stale rows.
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role) {
          if (last.text === text) return prev;
          if (text.startsWith(last.text)) {
            const next = prev.slice();
            next[next.length - 1] = { role, text };
            return next;
          }
          if (last.text.startsWith(text)) return prev;
        }
        return [...prev, { role, text }];
      });
    },
    [],
  );

  const onHeyTranscript = useCallback(
    (role: "interviewer" | "candidate", text: string) => {
      // Provider transcription can arrive as cumulative partials; pushTranscript
      // collapses those against the server-generated line already shown.
      pushTranscript(role, text);
    },
    [pushTranscript],
  );

  const liveTokenRef = useRef<string | null>(null);

  const hey = useHeyGenSession({
    getSessionToken: () => liveTokenRef.current,
    onTranscript: onHeyTranscript,
  });

  async function startInterview(provider: "auto" | "demo" = "auto") {
    if (!consent) return;

    // Typed live mode does not need microphone permission: the browser only
    // plays the avatar's WebRTC stream. We still check the browser can run it.
    const wantsLive =
      provider === "auto" &&
      (session.avatarProvider === "heygen" ||
        (health?.features.heygen === true && health?.features.avatarProvider === "heygen"));
    if (wantsLive) {
      const supportIssue = liveAvatarSupportIssue();
      if (supportIssue) {
        setError(supportIssue);
        setErrorCode("unsupported_browser");
        setPhase("error");
        return;
      }
    }

    setPhase("starting");
    setError(null);
    setErrorCode(null);
    setConfigIssues([]);
    setConfigDocsUrl(null);
    try {
      const res = await fetch(`/api/interviews/${sessionId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as {
        session: RoomSession;
        openingEvent: EngineEvent | null;
        avatar: { provider: string; sessionToken?: string; note?: string };
        error?: {
          code?: string;
          message?: string;
          details?: string[];
          docsUrl?: string;
        };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Could not start the interview.");
        setErrorCode(json.error?.code ?? null);
        setConfigIssues(Array.isArray(json.error?.details) ? json.error.details : []);
        setConfigDocsUrl(json.error?.docsUrl ?? null);
        setPhase("error");
        return;
      }
      setSession(json.session);
      setPhase("live");

      if (json.avatar.provider === "heygen" && json.avatar.sessionToken) {
        liveTokenRef.current = json.avatar.sessionToken;
        setLiveToken(json.avatar.sessionToken);
        if (json.openingEvent) {
          // HeyGen speaks this text itself through the context opening_text.
          // Mirror it in the question card and transcript immediately; never
          // call browser speech for a live avatar.
          setCurrentSpeech(json.openingEvent.text);
          pushTranscript("interviewer", json.openingEvent.text);
        }
      } else if (json.avatar.provider === "heygen") {
        setError(
          "The live avatar provider did not return a session token. Check the server logs and your LiveAvatar configuration.",
        );
        setErrorCode("avatar_unavailable");
        setPhase("error");
      } else if (json.openingEvent) {
        setCurrentSpeech(json.openingEvent.text);
        setTranscript((prev) => [...prev, { role: "interviewer", text: json.openingEvent!.text }]);
        speak(json.openingEvent.text);
      }
    } catch {
      setError("Network error while starting the interview.");
      setErrorCode("network");
      setPhase("error");
    }
  }

  /**
   * Mint a fresh server-side LiveAvatar session and reconnect the browser.
   * Tokens are single-use, so reconnecting always goes through /start again.
   */
  async function reconnectLive() {
    if (phase === "starting" || phase === "finishing") return;
    setError(null);
    setErrorCode(null);
    await hey.stop();
    liveTokenRef.current = null;
    setLiveToken(null);
    await startInterview("auto");
  }

  // Attach the local preview stream after the <video> element mounts (for
  // example when the camera is enabled from the consent dialog).
  useEffect(() => {
    if (camOn && webcamRef.current && webcamStreamRef.current) {
      webcamRef.current.srcObject = webcamStreamRef.current;
    }
  }, [camOn]);

  async function enableWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      webcamStreamRef.current = stream;
      if (webcamRef.current) webcamRef.current.srcObject = stream;
      setCamOn(true);
    } catch {
      setCamOn(false);
      setError("Camera access was not available. You can continue with camera off.");
    }
  }

  async function submitAnswer(event?: React.FormEvent) {
    event?.preventDefault();
    const answer = typedAnswer.trim();
    if (!answer || sendingRef.current || phase !== "live") return;
    if (isLive && (hey.status === "error" || hey.status === "disconnected")) {
      setError(
        "The live avatar is disconnected. Reconnect from the video panel before sending another answer.",
      );
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError(null);
    setTypedAnswer("");
    stopSpeech();
    try {
      const res = await fetch(`/api/interviews/${sessionId}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer, source: isLive ? "typed" : "demo_text" }),
      });
      const json = (await res.json()) as {
        event: EngineEvent;
        finished: boolean;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to process your answer.");
        setTypedAnswer(answer);
        return;
      }

      // The server accepted and persisted the answer. Only now mirror it in
      // the client transcript so a failed request cannot leave a phantom line.
      pushTranscript("candidate", answer);
      // Follow-ups and clarifications belong to the current planned question;
      // only a new planned question advances the progress counter.
      if (json.event.type === "ask_question") {
        setAskedCount((count) => count + 1);
      }
      setCurrentSpeech(json.event.text);
      pushTranscript("interviewer", json.event.text);

      const finished = json.finished || json.event.type === "finish_interview";
      if (isLive) {
        const spoken = hey.speak(json.event.text);
        if (!spoken.ok) {
          setError(
            `Your answer was saved, but the avatar could not speak the interviewer's reply. ${spoken.error}` +
              (finished ? " End the interview to see your report." : " Reconnect, then continue."),
          );
          return;
        }
        // Let the closing line finish before tearing down the WebRTC session.
        if (finished) await hey.waitForSpeechEnd();
      } else {
        speak(json.event.text);
      }

      if (finished) await finish(false);
    } catch {
      setError("Network error while submitting your answer.");
      setTypedAnswer(answer);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function finish(fromProviderStop = false) {
    if (phase === "finishing" || phase === "finished") return;
    setPhase("finishing");
    stopSpeech();
    try {
      await hey.stop();
      stopWebcam();
      const res = await fetch(`/api/interviews/${sessionId}/finish`, { method: "POST" });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok && !fromProviderStop) {
        setError(json.error?.message ?? "Failed to finalize the interview.");
        setPhase("error");
        return;
      }
      setPhase("finished");
      router.push(`/interview/${sessionId}/report`);
    } catch {
      setError("Network error while finishing. Your answers are saved as text.");
      setPhase("error");
    }
  }

  function stopWebcam() {
    webcamStreamRef.current?.getTracks().forEach((track) => track.stop());
    webcamStreamRef.current = null;
    setCamOn(false);
  }

  async function toggleCam() {
    if (camOn) {
      stopWebcam();
    } else {
      await enableWebcam();
    }
  }

  function toggleSpeech() {
    if (useSpeech) stopSpeech();
    setUseSpeech((current) => !current);
  }

  const status = getRoomStatus({
    phase,
    isLive,
    heyStatus: hey.status,
    sending,
    speechActive,
    liveBlocked,
  });
  const progress = session.durationMinutes * 60 - remaining;
  const answerDisabled =
    phase !== "live" ||
    sending ||
    (isLive && (hey.status === "error" || hey.status === "disconnected"));
  const planQuestions = session.plan?.questions.length ?? 0;
  const liveBadge =
    phase === "consent" && liveWillRun
      ? { label: "LIVE AVATAR READY", variant: "success" as const }
      : getLiveBadge(hey.status);

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="inline-flex shrink-0 items-baseline gap-1.5 text-sm font-semibold tracking-[-0.02em]"
          >
            SynergyAI
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          </Link>
          <span className="hidden text-border-strong sm:inline" aria-hidden>
            /
          </span>
          <p className="hidden truncate text-sm text-muted-foreground sm:block">{roleTitle}</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
            aria-live="polite"
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden />
            <span className="truncate">{status.label}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
            {formatDuration(remaining)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 border-destructive/25 bg-destructive-soft px-2.5 text-destructive hover:bg-destructive/15 hover:text-destructive"
            onClick={() => void finish()}
            disabled={phase === "consent" || phase === "starting" || phase === "finishing" || phase === "finished"}
          >
            <PhoneOff aria-hidden />
            <span className="hidden sm:inline">End interview</span>
            <span className="sm:hidden">End</span>
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-[62svh] flex-col lg:min-h-0 lg:flex-1">
          <div className="relative isolate flex-1 overflow-hidden bg-[#07090c]">
            {isLive ? (
              <LiveHeyGenStage
                sessionToken={liveToken}
                onReady={() => void hey.start()}
                status={hey.status}
                videoRef={hey.videoRef}
                error={hey.error}
                soundOn={hey.soundOn}
                autoplayBlocked={hey.autoplayBlocked}
                onEnableSound={() => void hey.enableSound()}
                onReconnect={() => void reconnectLive()}
                onEnd={() => void finish()}
              />
            ) : (
              <DemoInterviewerStage
                persona={persona}
                language={session.language}
                speaking={speechActive}
                caption={currentSpeech}
                awaitingStart={phase === "consent" || phase === "starting"}
                showCaption={captionsOn}
              />
            )}

            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/30 via-transparent to-black/25" aria-hidden />

            <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-7rem)] flex-wrap items-center gap-2 sm:left-5 sm:top-5">
              {showDemoLabel ? (
                <Badge
                  variant="demo"
                  className="border-white/10 bg-[#0b0d10]/90 px-2.5 py-1 text-[9px] tracking-[0.12em] sm:text-[10px]"
                >
                  DEMO — SIMULATED AI INTERVIEW
                </Badge>
              ) : (
                <Badge
                  variant={liveBadge.variant}
                  className="border-white/10 bg-[#0b0d10]/90 text-[10px]"
                >
                  {liveBadge.label}
                </Badge>
              )}
              {!captionsOn && showDemoLabel && (
                <span className="rounded-full border border-white/10 bg-[#0b0d10]/90 px-2.5 py-1 text-[10px] text-white/65">
                  Captions off
                </span>
              )}
            </div>

            {/* Candidate camera preview */}
            <div className="absolute right-3 top-3 z-20 w-24 overflow-hidden rounded-lg border border-white/15 bg-[#0b0d10] shadow-lift sm:right-5 sm:top-5 sm:w-32">
              {camOn ? (
                <video
                  ref={webcamRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[4/3] w-full scale-x-[-1] object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 text-white/40">
                  <VideoOff className="size-4" strokeWidth={1.5} aria-hidden />
                  <span className="text-[9px]">Camera off</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-white/10 bg-[#07090c]/80 px-1.5 py-0.5">
                <span className="text-[9px] font-medium text-white/80">You</span>
                <span className="text-[9px] text-white/40">Preview</span>
              </div>
            </div>

            {(phase === "starting" || phase === "finishing") && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#07090c]/80 p-6">
                <div className="flex max-w-sm flex-col items-center text-center">
                  <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
                  <p className="mt-4 text-sm font-medium text-white">
                    {phase === "starting" ? "Connecting your interviewer…" : "Preparing your feedback…"}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-white/55">
                    {phase === "starting"
                      ? "This usually takes a few seconds."
                      : "Reviewing your answers and building the practice report."}
                  </p>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#07090c]/90 p-5">
                <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lift">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
                    <AlertTriangle className="size-4" aria-hidden />
                  </div>
                  <h2 className="mt-4 text-base font-medium">
                    {errorCode === "avatar_configuration"
                      ? "Live avatar is not configured"
                      : errorCode === "unsupported_browser"
                        ? "Browser not supported"
                        : "The session hit a problem"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {error ?? "The interview could not continue."}
                  </p>

                  {configIssues.length > 0 && (
                    <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive-soft/40 px-3.5 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">
                        Required server configuration
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                        {configIssues.map((issue) => (
                          <li key={issue}>
                            <code className="font-mono text-[11px]">{issue}</code>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                        Add these to the deployment environment, then restart the server. The demo
                        interviewer remains available and is clearly labeled as a simulation.
                      </p>
                      {configDocsUrl && (
                        <a
                          href={configDocsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2"
                        >
                          LiveAvatar FULL mode setup
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void startInterview("auto")}
                      disabled={!consent}
                    >
                      Try again
                    </Button>
                    {(errorCode?.startsWith("avatar_") ||
                      errorCode === "unsupported_browser") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void startInterview("demo")}
                      >
                        Continue with demo
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push("/start")}
                    >
                      Back to setup
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Control dock */}
          <div className="flex h-[76px] shrink-0 items-center justify-between gap-3 border-y border-border bg-background px-3 sm:px-5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ControlButton
                icon={camOn ? Video : VideoOff}
                label={camOn ? "Camera on" : "Camera off"}
                pressed={camOn}
                onClick={() => void toggleCam()}
              />
              <ControlButton
                icon={captionsOn ? MessageSquare : MessageSquare}
                label={captionsOn ? "Captions on" : "Captions off"}
                pressed={captionsOn}
                onClick={() => setCaptionsOn((current) => !current)}
                disabled={isLive}
              />
              {!isLive && (
                <ControlButton
                  icon={useSpeech ? Volume2 : VolumeX}
                  label={useSpeech ? "Speech on" : "Speech off"}
                  pressed={useSpeech}
                  onClick={toggleSpeech}
                />
              )}
              {isLive && (
                <ControlButton
                  icon={hey.soundOn ? Volume2 : VolumeX}
                  label={hey.soundOn ? "Sound on" : "Sound off"}
                  pressed={hey.soundOn}
                  onClick={() => void hey.toggleMute()}
                />
              )}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden w-24 sm:block">
                <Progress value={progress} max={session.durationMinutes * 60} className="h-1" />
              </div>
              <span className="truncate text-[10px] text-faint">
                {isLive ? "Typed answers · live avatar" : "Typed answers · demo"}
              </span>
            </div>
          </div>
        </section>

        {/* Session rail */}
        <aside className="flex w-full flex-col border-border bg-surface lg:h-full lg:w-[390px] lg:shrink-0 lg:overflow-hidden lg:border-l">
          <div className="shrink-0 border-b border-border p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                {phase === "live" ? "In session" : "Ready room"}
              </p>
              <span className="text-[10px] tabular-nums text-faint">
                Question {Math.min(askedCount, planQuestions || askedCount)} of{" "}
                {planQuestions || "—"}
              </span>
            </div>
            <h1 className="mt-2.5 text-lg font-medium tracking-[-0.02em]">{roleTitle}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {persona.name} · {persona.title}
            </p>

            <div className="mt-4 rounded-lg border border-border bg-background p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
                Current question
              </p>
              <p className="mt-1.5 text-sm leading-6 text-foreground/90" aria-live="polite">
                {currentSpeech ||
                  (phase === "consent"
                    ? "Start the interview to see the first question."
                    : "Waiting for the interviewer…")}
              </p>
            </div>

            {!isLive && (
              <AvatarModeNotice
                liveConfigured={liveConfigured}
                issues={health?.features.heygenIssues}
                language={session.language}
              />
            )}

            {error && phase !== "error" && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription className="flex items-start justify-between gap-3">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="shrink-0 text-[10px] underline underline-offset-2"
                  >
                    Dismiss
                  </button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <form onSubmit={(event) => void submitAnswer(event)} className="shrink-0 border-b border-border p-5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="answer" className="text-xs font-medium">
                Your answer
              </label>
              <span className="text-[10px] text-faint">
                {sending ? "Thinking…" : isLive ? "Spoken by the avatar" : "Typed in demo"}
              </span>
            </div>
            <Textarea
              id="answer"
              rows={4}
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder={
                phase === "live"
                  ? "Type your answer as you would say it aloud…"
                  : "Start the interview to answer."
              }
              disabled={answerDisabled}
              className="mt-2.5 min-h-[96px] resize-none bg-background text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submitAnswer();
                }
              }}
            />
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="text-[10px] text-faint">Ctrl/⌘ + Enter to send</span>
              <Button
                type="submit"
                size="sm"
                disabled={answerDisabled || !typedAnswer.trim()}
              >
                {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                {sending ? "Sending" : "Send answer"}
              </Button>
            </div>
            {isLive && phase === "live" && (
              <p className="mt-3 text-[10px] leading-4 text-faint">
                Your typed answer is saved as text and read aloud by the live avatar. Microphone
                input is not used.
              </p>
            )}
          </form>

          <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                Conversation
              </p>
              <span className="text-[10px] tabular-nums text-faint">
                {transcript.length} {transcript.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <div ref={transcriptScrollRef} className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1 lg:max-h-none lg:flex-1">
              {transcript.length === 0 && (
                <p className="text-xs leading-5 text-faint">
                  The conversation will appear here as you practise.
                </p>
              )}
              {transcript.map((entry, index) => (
                <div key={`${entry.role}-${index}`} className="text-sm">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">
                    {entry.role === "interviewer" ? persona.name : "You"}
                  </p>
                  <p className="mt-1 leading-6 text-muted-foreground">{entry.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 shrink-0 text-[10px] leading-4 text-faint">
              Stored as text only. Camera preview stays on this device.
            </p>
          </div>
        </aside>
      </main>

      {(phase === "consent" || phase === "starting") && (
        <ConsentScreen
          persona={persona}
          language={session.language}
          durationMinutes={session.durationMinutes}
          isLive={liveWillRun}
          consent={consent}
          setConsent={setConsent}
          onStart={() => void startInterview()}
          onCancel={() => router.push("/start")}
          starting={phase === "starting"}
          error={error}
          camOn={camOn}
          toggleCam={() => void toggleCam()}
          configurationIssues={liveBlocked ? (health?.features.heygenIssues ?? []) : []}
        />
      )}

      {phase === "finished" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
          <div className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-5" aria-hidden />
            </div>
            <h2 className="mt-5 text-xl font-medium">Interview complete</h2>
            <p className="mt-2 text-sm text-muted-foreground">Opening your coaching report…</p>
            <Skeleton className="mx-auto mt-6 h-1 w-32" />
          </div>
        </div>
      )}
    </div>
  );
}

function getRoomStatus({
  phase,
  isLive,
  heyStatus,
  sending,
  speechActive,
  liveBlocked,
}: {
  phase: Phase;
  isLive: boolean;
  heyStatus: HeyGenStatus;
  sending: boolean;
  speechActive: boolean;
  liveBlocked?: boolean;
}): { label: string; dot: string } {
  if (phase === "starting") return { label: "Connecting", dot: "bg-primary animate-pulse" };
  if (phase === "finishing") return { label: "Preparing feedback", dot: "bg-warning animate-pulse" };
  if (phase === "finished") return { label: "Complete", dot: "bg-success" };
  if (phase === "error") return { label: "Connection issue", dot: "bg-destructive" };
  if (phase === "consent") {
    return liveBlocked
      ? { label: "Setup required", dot: "bg-warning" }
      : { label: "Ready", dot: "bg-border-strong" };
  }
  if (isLive) {
    switch (heyStatus) {
      case "connecting":
        return { label: "Connecting avatar", dot: "bg-primary animate-pulse" };
      case "reconnecting":
        return { label: "Reconnecting avatar", dot: "bg-warning animate-pulse" };
      case "interviewer-speaking":
        return { label: "Interviewer speaking", dot: "bg-primary animate-pulse" };
      case "candidate-speaking":
        return { label: "Your turn", dot: "bg-success" };
      case "ready":
        return { label: "Your turn", dot: "bg-success" };
      case "disconnected":
        return { label: "Avatar disconnected", dot: "bg-destructive" };
      case "error":
        return { label: "Avatar error", dot: "bg-destructive" };
      default:
        return { label: "Starting avatar", dot: "bg-border-strong" };
    }
  }
  if (sending) return { label: "Thinking", dot: "bg-warning animate-pulse" };
  if (speechActive) return { label: "Speaking", dot: "bg-primary" };
  return { label: "Your turn", dot: "bg-success" };
}

/** Badge shown over the live stage — describes the real provider state. */
function getLiveBadge(status: HeyGenStatus): {
  label: string;
  variant: "success" | "secondary" | "destructive" | "warning";
} {
  switch (status) {
    case "ready":
      return { label: "LIVE AVATAR", variant: "success" };
    case "interviewer-speaking":
      return { label: "AVATAR SPEAKING", variant: "success" };
    case "candidate-speaking":
      return { label: "AVATAR READY", variant: "success" };
    case "connecting":
      return { label: "CONNECTING AVATAR", variant: "secondary" };
    case "reconnecting":
      return { label: "RECONNECTING", variant: "warning" };
    case "disconnected":
      return { label: "AVATAR DISCONNECTED", variant: "destructive" };
    case "error":
      return { label: "AVATAR ERROR", variant: "destructive" };
    default:
      return { label: "AVATAR IDLE", variant: "secondary" };
  }
}

function ControlButton({
  icon: Icon,
  label,
  pressed,
  onClick,
  disabled,
}: {
  icon: typeof Video;
  label: string;
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-[11px] transition-colors sm:px-3",
        pressed
          ? "bg-elevated text-foreground"
          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * Shared stage layout used by both live and demo interviewer visuals.
 * Kept intentionally simple so demo and live rendering stay mutually exclusive.
 */
export function InterviewerStage({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className="relative aspect-video overflow-hidden rounded-xl border border-border bg-[#07090c]"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function LiveHeyGenStage({
  sessionToken,
  onReady,
  status,
  videoRef,
  error,
  soundOn,
  autoplayBlocked,
  onEnableSound,
  onReconnect,
  onEnd,
}: {
  sessionToken: string | null;
  onReady: () => void;
  status: HeyGenStatus;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  soundOn: boolean;
  autoplayBlocked: boolean;
  onEnableSound: () => void;
  onReconnect: () => void;
  onEnd: () => void;
}) {
  const startedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (sessionToken && startedForRef.current !== sessionToken) {
      startedForRef.current = sessionToken;
      onReady();
    }
  }, [sessionToken, onReady]);

  const connecting =
    status === "idle" || status === "connecting" || status === "reconnecting";
  const failed = status === "error" || status === "disconnected";
  const overlay = connecting || failed || autoplayBlocked;

  return (
    <div className="absolute inset-0 bg-[#07090c]">
      {/* LiveKit/HeyGen attaches the real remote audio + video tracks here. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!soundOn}
        aria-label="Live AI interviewer video"
        className="h-full w-full bg-[#07090c] object-cover"
      />

      {overlay && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#07090c]/92 px-6 text-center">
          {failed ? (
            <AlertTriangle className="size-6 text-destructive" aria-hidden />
          ) : autoplayBlocked ? (
            <Volume2 className="size-6 text-primary" aria-hidden />
          ) : (
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          )}
          <p className="max-w-sm text-sm text-white/75" role="status">
            {failed
              ? (error ??
                (status === "disconnected"
                  ? "The live avatar disconnected. Reconnect to continue this interview."
                  : "The live avatar failed to connect."))
              : autoplayBlocked
                ? "Your browser paused the avatar video. Tap below to start it with sound."
                : status === "reconnecting"
                  ? "Reconnecting to your live interviewer…"
                  : "Connecting to your live interviewer…"}
          </p>
          {failed ? (
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={onReconnect}>
                <RefreshCw aria-hidden />
                Reconnect
              </Button>
              <Button size="sm" variant="secondary" onClick={onEnd}>
                End interview
              </Button>
            </div>
          ) : autoplayBlocked ? (
            <Button size="sm" className="mt-1" onClick={onEnableSound}>
              <Volume2 aria-hidden />
              Start video with sound
            </Button>
          ) : (
            <p className="text-[11px] text-white/45">
              A real-time video stream is being established. This usually takes a few seconds.
            </p>
          )}
        </div>
      )}

      {!overlay && !soundOn && (
        <button
          type="button"
          onClick={onEnableSound}
          className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0d10]/90 px-3 py-2 text-[11px] font-medium text-white/90 shadow-lift transition-colors hover:bg-[#14171c]"
        >
          <Volume2 className="size-3.5" aria-hidden />
          Sound off — enable audio
        </button>
      )}
    </div>
  );
}

/**
 * Visual demo interviewer — a licensed still portrait with a speaking
 * indicator. This is NOT a live, animated AI video stream and is labeled as a
 * simulation everywhere it appears.
 */
export function DemoInterviewerStage({
  persona,
  language,
  speaking,
  caption,
  awaitingStart,
  showCaption = true,
}: {
  persona: InterviewerPersona;
  language: InterviewLanguage;
  speaking: boolean;
  caption: string;
  awaitingStart: boolean;
  showCaption?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const welcome =
    language === "pt"
      ? `Olá! Eu sou ${persona.name}, sua entrevistadora de prática. Quando estiver pronto(a), clique em “Iniciar entrevista”.`
      : `Hi, I'm ${persona.name}, your practice interviewer. When you're ready, press “Start interview”.`;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#07090c]" data-speaking={speaking ? "true" : "false"}>
      {imgError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-elevated">
          <span className="text-7xl font-semibold tracking-tight text-muted-foreground/50" aria-hidden>
            {persona.name.slice(0, 1)}
          </span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- local licensed portrait
        <img
          src={persona.portraitSrc}
          alt={`${persona.name}, ${persona.title} — photographic practice portrait`}
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: persona.portraitPosition ?? "50% 26%" }}
          width={1000}
          height={1498}
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-[#07090c] via-[#07090c]/10 to-[#07090c]/10"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#07090c] via-[#07090c]/65 to-transparent"
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-medium text-white">{persona.name}</p>
          <span className="size-0.5 rounded-full bg-white/35" aria-hidden />
          <p className="text-xs text-white/55">{persona.title}</p>
          {speaking && (
            <span className="ml-1 flex items-end gap-0.5" aria-label="Interviewer speaking">
              {[5, 10, 7, 12, 6].map((height, index) => (
                <span
                  key={index}
                  className="w-0.5 animate-pulse rounded-full bg-primary"
                  style={{ height, animationDelay: `${index * 110}ms` }}
                />
              ))}
            </span>
          )}
        </div>
        {showCaption && (
          <p
            className="mt-3 max-w-2xl text-pretty text-lg font-medium leading-7 tracking-[-0.01em] text-white sm:text-xl sm:leading-8"
            aria-live="polite"
          >
            {caption || (awaitingStart ? welcome : "…")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Compact, honest mode notice: what the user is seeing, and what live video
 * would additionally require.
 */
export function AvatarModeNotice({
  liveConfigured,
  issues = [],
  language,
}: {
  liveConfigured: boolean;
  issues?: string[];
  language: InterviewLanguage;
}) {
  return (
    <div className="mt-4 rounded-lg border border-demo/20 bg-demo-soft px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-demo">
        {language === "pt" ? "DEMO — ENTREVISTA DE IA SIMULADA" : "DEMO — SIMULATED AI INTERVIEW"}
      </p>
      <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
        {language === "pt"
          ? "Retrato estático com diálogo simulado — não é um vídeo de IA ao vivo."
          : "Still portrait with simulated dialogue — not a live AI video stream."}{" "}
        {!liveConfigured && (
          <>
            {language === "pt" ? "Vídeo ao vivo requer " : "Live video requires "}
            {issues.length > 0 ? (
              <code className="font-mono text-[10px]">{issues.join(", ")}</code>
            ) : (
              <>
                <code className="font-mono text-[10px]">HEYGEN_API_KEY</code> +{" "}
                <code className="font-mono text-[10px]">HEYGEN_AVATAR_ID</code>
              </>
            )}
            .{" "}
            <Link
              href="/about"
              className="inline-flex items-center gap-1 font-medium text-demo underline underline-offset-2"
            >
              <Settings className="size-2.5" aria-hidden />
              {language === "pt" ? "Saiba mais" : "See setup"}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function ConsentScreen({
  persona,
  language,
  durationMinutes,
  isLive,
  consent,
  setConsent,
  onStart,
  onCancel,
  starting,
  error,
  camOn,
  toggleCam,
  configurationIssues = [],
}: {
  persona: InterviewerPersona;
  language: InterviewLanguage;
  durationMinutes: number;
  isLive: boolean;
  consent: boolean;
  setConsent: (value: boolean) => void;
  onStart: () => void;
  onCancel: () => void;
  starting: boolean;
  error: string | null;
  camOn: boolean;
  toggleCam: () => void;
  /** Live video was requested but required server values are missing. */
  configurationIssues?: string[];
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Before you begin</DialogTitle>
          <DialogDescription>
            {persona.name} ({persona.title}) will guide this {durationMinutes}-minute practice
            session, in {language === "pt" ? "Brazilian Portuguese" : "English"}.
          </DialogDescription>
        </DialogHeader>

        {configurationIssues.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs leading-5">
              Live video was requested for this deployment but is not configured. Starting now will
              show the exact setup error instead of live video; from there you can continue with
              the clearly labeled demo interviewer. Missing:{" "}
              <code className="font-mono text-[10px]">{configurationIssues.join(", ")}</code>.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-border bg-background p-3.5">
          <ul className="space-y-2 text-xs leading-5 text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Microphone:</strong>{" "}
              {isLive
                ? "not used. You type each answer; the live avatar speaks the interviewer's lines aloud with synchronized audio and video."
                : "not used in demo mode. You will type your answers; the optional browser voice is clearly simulated."}
            </li>
            <li>
              <strong className="font-medium text-foreground">Camera:</strong> optional. The preview
              stays on this device and is never uploaded or recorded.
            </li>
            <li>
              <strong className="font-medium text-foreground">Transcript:</strong> the conversation
              is saved as text to create your practice report.
            </li>
          </ul>
        </div>

        {!isLive && (
          <div className="rounded-lg border border-demo/20 bg-demo-soft px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-demo">
              Demo interviewer
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {persona.name} is a fictional practice persona shown with a licensed still photograph.
              Dialogue is simulated; this is not a live AI video call.
            </p>
          </div>
        )}

        {isLive && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              Live AI avatar
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {persona.name} appears as a real-time video avatar. Type each answer; SynergyAI
              generates the next interviewer line and the avatar speaks it with lip-sync. Audio is
              muted until you enable sound in the room.
            </p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={toggleCam} aria-pressed={camOn}>
            {camOn ? <Video aria-hidden /> : <VideoOff aria-hidden />}
            {camOn ? "Camera preview on" : "Camera off"}
          </Button>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-xs leading-5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-[var(--color-primary)]"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span className="text-muted-foreground">
            I understand this is an AI-assisted practice simulation, not a real interview or a
            hiring decision.
          </span>
        </label>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={starting}>
            Cancel
          </Button>
          <Button onClick={onStart} disabled={!consent || starting}>
            {starting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Starting…
              </>
            ) : (
              "Start interview"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
