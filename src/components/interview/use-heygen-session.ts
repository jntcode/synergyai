"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionDisconnectReason,
  SessionEvent,
  SessionState,
} from "@heygen/liveavatar-web-sdk";

export interface HeyGenStageProps {
  /** Returns the short-lived session token once the server has minted it. */
  getSessionToken: () => string | null;
  onTranscript: (role: "interviewer" | "candidate", text: string) => void;
  /** Fired for provider-side endings so the room can offer report/reconnect. */
  onDisconnected?: (reason: string) => void;
}

export type HeyGenStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "interviewer-speaking"
  | "candidate-speaking"
  /** A previously connected session is being re-established. */
  | "reconnecting"
  | "disconnected"
  | "error";

export type SpeakResult = { ok: true } | { ok: false; error: string };

/** True when this browser can play the LiveAvatar WebRTC video stream. */
export function liveAvatarSupportIssue(): string | null {
  if (typeof window === "undefined") return "The live avatar can only run in a browser.";
  if (typeof window.RTCPeerConnection === "undefined") {
    return "This browser does not support WebRTC video calls. Use a recent version of Chrome, Edge, Firefox, or Safari.";
  }
  if (typeof window.MediaStream === "undefined") {
    return "This browser does not support media streams required by the live avatar.";
  }
  return null;
}

function friendlyStartError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.toLowerCase();
  if (message.includes("401") || message.includes("403") || message.includes("unauthor")) {
    return "The live avatar token was rejected. Reconnect to mint a fresh session token.";
  }
  if (message.includes("409") || message.includes("already")) {
    return "This live avatar session was already used. Reconnect to start a fresh one.";
  }
  return raw || "The live avatar could not connect.";
}

/**
 * Browser wrapper around the official HeyGen LiveAvatar SDK (FULL mode).
 *
 * The provider owns TTS, lip-sync, and the WebRTC audio/video tracks. This hook
 * attaches the real remote tracks to the stage <video> and exposes `speak()`,
 * which sends the documented `avatar.speak_text` command (`session.repeat`).
 * SynergyAI's server generates every interviewer line; the provider's
 * microphone/voice-chat pipeline is intentionally not started in typed mode.
 */
export function useHeyGenSession({
  getSessionToken,
  onTranscript,
  onDisconnected,
}: HeyGenStageProps) {
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const stoppingRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const soundOnRef = useRef(false);
  const streamReadyRef = useRef(false);
  const speechDoneRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<HeyGenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const getSessionTokenRef = useRef(getSessionToken);
  const onTranscriptRef = useRef(onTranscript);
  const onDisconnectedRef = useRef(onDisconnected);
  useEffect(() => {
    getSessionTokenRef.current = getSessionToken;
    onTranscriptRef.current = onTranscript;
    onDisconnectedRef.current = onDisconnected;
  });

  const updateStatus = useCallback((next: HeyGenStatus) => {
    if (mountedRef.current) setStatus(next);
  }, []);

  /** Resolve any pending wait so finish/cleanup can never hang. */
  const resolveSpeechWait = useCallback(() => {
    const done = speechDoneRef.current;
    speechDoneRef.current = null;
    done?.();
  }, []);

  /**
   * Try playback with sound first (the room was started by a user gesture).
   * If the browser blocks unmuted autoplay, fall back to muted playback and
   * expose a visible "enable audio" affordance.
   */
  const playVideo = useCallback(async (preferSound: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    const wantsSound = preferSound || soundOnRef.current;
    video.muted = !wantsSound;
    try {
      await video.play();
      if (wantsSound) {
        soundOnRef.current = true;
        if (mountedRef.current) setSoundOn(true);
      }
      if (mountedRef.current) setAutoplayBlocked(false);
      return;
    } catch {
      if (wantsSound) {
        video.muted = true;
        try {
          await video.play();
          if (mountedRef.current) {
            setSoundOn(false);
            setAutoplayBlocked(true);
          }
          return;
        } catch {
          /* fall through to the blocked state */
        }
      }
      if (mountedRef.current) setAutoplayBlocked(true);
    }
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;

    const supportIssue = liveAvatarSupportIssue();
    if (supportIssue) {
      setError(supportIssue);
      updateStatus("error");
      return;
    }

    const sessionToken = getSessionTokenRef.current();
    if (!sessionToken) {
      setError("The live avatar session token is not available. Start the interview again.");
      updateStatus("error");
      return;
    }

    const reconnecting = hasConnectedRef.current;
    stoppingRef.current = false;
    streamReadyRef.current = false;
    setError(null);
    setAutoplayBlocked(false);
    updateStatus(reconnecting ? "reconnecting" : "connecting");

    try {
      // No `voiceChat` config: typed answers are the only input path. The
      // provider's microphone capture must not start and compete with the
      // interview engine.
      const session = new LiveAvatarSession(sessionToken, { autoKeepAlive: true });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
        if (state === SessionState.CONNECTED) {
          hasConnectedRef.current = true;
          if (streamReadyRef.current) updateStatus("ready");
        } else if (state === SessionState.DISCONNECTED && !stoppingRef.current) {
          resolveSpeechWait();
          updateStatus("disconnected");
        }
      });

      // The SDK fans the remote video + audio tracks into a single element;
      // attach only works once BOTH tracks are subscribed.
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        const video = videoRef.current;
        if (!video) return;
        try {
          session.attach(video);
        } catch (err) {
          if (mountedRef.current) {
            setError(
              err instanceof Error ? err.message : "The avatar video stream could not be attached.",
            );
            updateStatus("error");
          }
          return;
        }
        streamReadyRef.current = true;
        void playVideo(true).then(() => {
          if (!mountedRef.current) return;
          setStatus((current) => {
            if (current === "interviewer-speaking" || current === "candidate-speaking") {
              return current;
            }
            return "ready";
          });
        });
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, (reason: SessionDisconnectReason) => {
        if (stoppingRef.current) return;
        if (reason === SessionDisconnectReason.CLIENT_INITIATED) return;
        resolveSpeechWait();
        updateStatus("disconnected");
        onDisconnectedRef.current?.(String(reason));
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        updateStatus("interviewer-speaking");
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        resolveSpeechWait();
        setStatus((current) => (current === "interviewer-speaking" ? "ready" : current));
      });
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (event: { text?: string }) => {
        const text = event.text?.trim();
        if (text) onTranscriptRef.current("interviewer", text);
      });

      session.on(AgentEventsEnum.SESSION_STOPPED, (event: { stop_reason?: string }) => {
        if (stoppingRef.current) return;
        resolveSpeechWait();
        updateStatus("disconnected");
        onDisconnectedRef.current?.(event.stop_reason ?? "SESSION_STOPPED");
      });

      session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, () => {
        // Quality changes are informative only; the SDK manages adaptation.
      });

      await session.start();
      hasConnectedRef.current = true;
    } catch (err) {
      if (mountedRef.current) {
        setError(friendlyStartError(err));
        updateStatus("error");
      }
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        try {
          await session.stop();
        } catch {
          /* already stopped by the SDK failure path */
        }
      }
    }
  }, [playVideo, resolveSpeechWait, updateStatus]);

  /**
   * Speak a server-generated interviewer line with the documented
   * `avatar.speak_text` event. Never pretends to have spoken when the session
   * is not connected or the command fails.
   */
  const speak = useCallback(
    (text: string): SpeakResult => {
      const line = text.trim();
      if (!line) {
        return { ok: false, error: "There is no interviewer text to speak." };
      }
      const session = sessionRef.current;
      if (!session || session.state !== SessionState.CONNECTED) {
        const message =
          "The live avatar is not connected yet, so this question could not be spoken. Reconnect from the video panel, then replay the question.";
        if (mountedRef.current) setError(message);
        return { ok: false, error: message };
      }
      try {
        // Stop any prior/queued line before speaking the new turn.
        try {
          session.interrupt();
        } catch {
          /* interrupted during teardown */
        }
        session.repeat(line);
        if (mountedRef.current) setError(null);
        updateStatus("interviewer-speaking");
        return { ok: true };
      } catch (err) {
        const message =
          err instanceof Error
            ? `The avatar could not speak this turn: ${err.message}`
            : "The avatar could not speak this turn.";
        if (mountedRef.current) setError(message);
        return { ok: false, error: message };
      }
    },
    [updateStatus],
  );

  /**
   * Resolve when the current avatar speech ends (or the timeout elapses).
   * Used before stopping a live session so the closing line can be heard.
   */
  const waitForSpeechEnd = useCallback(
    (timeoutMs = 12_000): Promise<void> =>
      new Promise((resolve) => {
        const session = sessionRef.current;
        if (!session || session.state !== SessionState.CONNECTED) {
          resolve();
          return;
        }
        resolveSpeechWait();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (speechDoneRef.current === finish) speechDoneRef.current = null;
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        speechDoneRef.current = finish;
      }),
    [resolveSpeechWait],
  );

  const stop = useCallback(async () => {
    stoppingRef.current = true;
    const session = sessionRef.current;
    sessionRef.current = null;
    soundOnRef.current = false;
    streamReadyRef.current = false;
    resolveSpeechWait();
    if (mountedRef.current) {
      setStatus("idle");
      setSoundOn(false);
      setAutoplayBlocked(false);
    }
    if (!session) return;
    try {
      await session.stop();
    } catch {
      /* best-effort cleanup */
    } finally {
      session.removeAllListeners();
    }
  }, [resolveSpeechWait]);

  const enableSound = useCallback(async () => {
    soundOnRef.current = true;
    if (mountedRef.current) setSoundOn(true);
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    try {
      await video.play();
      if (mountedRef.current) setAutoplayBlocked(false);
    } catch {
      if (mountedRef.current) setAutoplayBlocked(true);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (soundOnRef.current) {
      soundOnRef.current = false;
      if (mountedRef.current) setSoundOn(false);
      if (videoRef.current) videoRef.current.muted = true;
      return;
    }
    await enableSound();
  }, [enableSound]);

  const interrupt = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.CONNECTED) return;
    try {
      session.interrupt();
    } catch {
      /* already disconnected */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stop();
    };
    // `stop` intentionally runs only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoRef,
    status,
    error,
    soundOn,
    autoplayBlocked,
    start,
    stop,
    enableSound,
    toggleMute,
    speak,
    waitForSpeechEnd,
    interrupt,
  };
}
