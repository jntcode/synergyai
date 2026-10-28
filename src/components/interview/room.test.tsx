// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  InterviewRoom,
  DemoInterviewerStage,
  AvatarModeNotice,
  LiveHeyGenStage,
} from "@/components/interview/room";
import { getPersona } from "@/lib/interview/personas";

const heygenSessions: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  repeat: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  state: string;
  emit: (event: string, payload?: unknown) => void;
}[] = [];

vi.mock("@heygen/liveavatar-web-sdk", () => {
  class LiveAvatarSession {
    state = "DISCONNECTED";
    private listeners = new Map<string, (payload?: unknown) => void>();
    start = vi.fn(async () => {
      this.state = "CONNECTED";
      this.listeners.get("session.state_changed")?.("CONNECTED");
    });
    stop = vi.fn(async () => {
      this.state = "DISCONNECTED";
    });
    on = vi.fn((event: string, callback: (payload?: unknown) => void) => {
      this.listeners.set(event, callback);
    });
    attach = vi.fn();
    repeat = vi.fn((text: string) => {
      // Emit completion asynchronously so waitForSpeechEnd can observe it.
      setTimeout(() => this.listeners.get("avatar.speak_ended")?.(), 0);
      return text;
    });
    interrupt = vi.fn();
    keepAlive = vi.fn();
    removeAllListeners = vi.fn(() => this.listeners.clear());
    emit = (event: string, payload?: unknown) => this.listeners.get(event)?.(payload);
    constructor() {
      heygenSessions.push(this);
    }
  }
  return {
    LiveAvatarSession,
    SessionState: {
      CONNECTED: "CONNECTED",
      DISCONNECTED: "DISCONNECTED",
      INACTIVE: "INACTIVE",
      CONNECTING: "CONNECTING",
    },
    SessionEvent: {
      SESSION_STATE_CHANGED: "session.state_changed",
      SESSION_STREAM_READY: "session.stream_ready",
      SESSION_DISCONNECTED: "session.disconnected",
      SESSION_CONNECTION_QUALITY_CHANGED: "session.connection_quality_changed",
    },
    AgentEventsEnum: {
      USER_TRANSCRIPTION: "user.transcription",
      AVATAR_TRANSCRIPTION: "avatar.transcription",
      AVATAR_SPEAK_STARTED: "avatar.speak_started",
      AVATAR_SPEAK_ENDED: "avatar.speak_ended",
      USER_SPEAK_STARTED: "user.speak_started",
      USER_SPEAK_ENDED: "user.speak_ended",
      SESSION_STOPPED: "session.stopped",
    },
    SessionDisconnectReason: { CLIENT_INITIATED: "CLIENT_INITIATED" },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const healthState = vi.hoisted(() => ({
  value: {
    ok: true,
    features: {
      supabase: false,
      supabaseSecret: false,
      openai: false,
      heygen: false,
      heygenIssues: [] as string[],
      heygenRequested: false,
      avatarProvider: "demo",
      auth: "demo",
      demoMode: true,
    },
  },
}));

vi.mock("@/lib/hooks", () => ({
  useHealth: () => ({
    health: healthState.value,
    loading: false,
  }),
}));

const SESSION = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  status: "draft",
  durationMinutes: 15,
  language: "en" as const,
  persona: "friendly_recruiter",
  avatarProvider: "demo",
  plan: null,
  startedAt: null,
};

function renderRoom() {
  return render(
    <InterviewRoom sessionId={SESSION.id} initialSession={SESSION} initialTranscript={[]} />,
  );
}

describe("InterviewRoom (demo mode)", () => {
  beforeEach(() => {
    heygenSessions.length = 0;
    healthState.value.features.heygen = false;
    healthState.value.features.heygenIssues = [];
    healthState.value.features.heygenRequested = false;
    healthState.value.features.avatarProvider = "demo";
    Element.prototype.scrollIntoView = vi.fn();
    window.speechSynthesis = undefined as unknown as SpeechSynthesis;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the interviewer portrait immediately, labeled as a simulated demo", () => {
    renderRoom();

    const portrait = screen.getByAltText(/Avery.*photographic practice portrait/i);
    expect(portrait).toBeInTheDocument();
    expect(portrait).toHaveAttribute("src", "/interviewers/avery.jpg");

    expect(screen.getAllByText(/DEMO — SIMULATED AI INTERVIEW/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a live AI video stream/i)).toBeInTheDocument();
    // Consent overlays the stage — the interviewer stays visible.
    expect(screen.getByText("Before you begin")).toBeInTheDocument();
  });

  it("does not create a HeyGen session in demo mode", () => {
    renderRoom();
    expect(heygenSessions).toHaveLength(0);
  });

  it("shows Setup required when live was requested but is unconfigured", () => {
    healthState.value.features.heygenRequested = true;
    healthState.value.features.avatarProvider = "heygen";
    healthState.value.features.heygenIssues = ["HEYGEN_API_KEY", "HEYGEN_AVATAR_ID"];
    renderRoom();

    expect(screen.getByText("Setup required")).toBeInTheDocument();
    expect(screen.getByText(/Live video was requested for this deployment/i)).toBeInTheDocument();
    expect(screen.getAllByText(/HEYGEN_API_KEY, HEYGEN_AVATAR_ID/i).length).toBeGreaterThan(0);
  });

  it("cancels speech synthesis when unmounted", () => {
    const cancel = vi.fn();
    window.speechSynthesis = { cancel } as unknown as SpeechSynthesis;
    const { unmount } = renderRoom();
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});

describe("InterviewRoom (live typed mode)", () => {
  const LIVE_SESSION = {
    ...SESSION,
    status: "draft",
    avatarProvider: "heygen",
  };

  beforeEach(() => {
    heygenSessions.length = 0;
    healthState.value.features.heygen = true;
    healthState.value.features.heygenIssues = [];
    healthState.value.features.heygenRequested = true;
    healthState.value.features.avatarProvider = "heygen";
    Element.prototype.scrollIntoView = vi.fn();
    window.speechSynthesis = undefined as unknown as SpeechSynthesis;
    Object.defineProperty(window, "RTCPeerConnection", {
      value: class {},
      configurable: true,
    });
    Object.defineProperty(window, "MediaStream", {
      value: class {},
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  function mockInterviewFetch(turnText = "Thanks. Tell me about the result.") {
    const fetchMock = vi.fn(async (...args: [input: RequestInfo | URL, init?: RequestInit]) => {
      const [input] = args;
      const url = String(input);
      if (url.endsWith("/start")) {
        return jsonResponse({
          session: { ...LIVE_SESSION, status: "in_progress" },
          openingEvent: { type: "ask_question", text: "Tell me about yourself." },
          avatar: { provider: "heygen", sessionToken: "tok-live" },
          analysisMode: "demo",
        });
      }
      if (url.endsWith("/turn")) {
        return jsonResponse({
          event: { type: "ask_question", text: turnText },
          finished: false,
          analysisMode: "demo",
          turnMode: "demo",
        });
      }
      return jsonResponse({ error: { message: "unexpected" } }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function startLiveRoom() {
    render(
      <InterviewRoom
        sessionId={SESSION.id}
        initialSession={LIVE_SESSION}
        initialTranscript={[]}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /start interview/i }));
    await waitFor(() => expect(heygenSessions).toHaveLength(1));
    await waitFor(() => expect(heygenSessions[0]!.start).toHaveBeenCalled());
  }

  it("sends typed answers to the server and speaks the reply with the avatar", async () => {
    const fetchMock = mockInterviewFetch();
    await startLiveRoom();

    expect(screen.getAllByText("Tell me about yourself.").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/your answer/i), {
      target: { value: "I led a checkout redesign that reduced abandonment." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send answer/i }));

    await waitFor(() =>
      expect(heygenSessions[0]!.repeat).toHaveBeenCalledWith(
        "Thanks. Tell me about the result.",
      ),
    );
    expect(
      screen.getAllByText("I led a checkout redesign that reduced abandonment.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Thanks. Tell me about the result.").length,
    ).toBeGreaterThan(0);

    const turnCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/turn"),
    );
    expect(turnCalls).toHaveLength(1);
    const body = JSON.parse(String((turnCalls[0]![1] as RequestInit).body));
    expect(body).toEqual({
      answer: "I led a checkout redesign that reduced abandonment.",
      source: "typed",
    });
  });

  it("ignores a duplicate submit while a turn is processing", async () => {
    const fetchMock = mockInterviewFetch("Next question?");
    await startLiveRoom();

    const textarea = screen.getByLabelText(/your answer/i);
    fireEvent.change(textarea, { target: { value: "A substantive first answer." } });
    const form = textarea.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(heygenSessions[0]!.repeat).toHaveBeenCalledWith("Next question?"),
    );
    const turnCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/turn"),
    );
    expect(turnCalls).toHaveLength(1);
  });
});

describe("DemoInterviewerStage", () => {
  afterEach(() => cleanup());

  it("keeps the portrait visible and shows the current question caption", () => {
    render(
      <DemoInterviewerStage
        persona={getPersona("friendly_recruiter")}
        language="en"
        speaking={false}
        caption="Tell me about a difficult project."
        awaitingStart={false}
      />,
    );
    expect(screen.getByAltText(/Avery/i)).toBeInTheDocument();
    expect(screen.getByText("Tell me about a difficult project.")).toBeInTheDocument();
    expect(screen.getByText("Avery")).toBeInTheDocument();
  });

  it("reflects the speaking state on the indicator", () => {
    const { container, rerender } = render(
      <DemoInterviewerStage
        persona={getPersona("friendly_recruiter")}
        language="en"
        speaking
        caption="Speaking now"
        awaitingStart={false}
      />,
    );
    expect(container.querySelector('[data-speaking="true"]')).not.toBeNull();

    rerender(
      <DemoInterviewerStage
        persona={getPersona("friendly_recruiter")}
        language="en"
        speaking={false}
        caption=""
        awaitingStart
      />,
    );
    expect(container.querySelector('[data-speaking="false"]')).not.toBeNull();
    // Welcome line before the interview starts.
    expect(screen.getByText(/When you're ready/i)).toBeInTheDocument();
  });

  it("falls back to initials when the portrait image fails to load", () => {
    render(
      <DemoInterviewerStage
        persona={getPersona("corporate_interviewer")}
        language="en"
        speaking={false}
        caption=""
        awaitingStart={false}
      />,
    );
    const img = screen.getByAltText(/Morgan/i);
    fireEvent.error(img);
    // Fallback initial is rendered in place of the image.
    expect(screen.queryByAltText(/Morgan/i)).not.toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });
});

describe("AvatarModeNotice", () => {
  afterEach(() => cleanup());

  it("explains the demo and the live-video requirements when live is not configured", () => {
    render(<AvatarModeNotice liveConfigured={false} language="en" />);
    expect(screen.getByText(/DEMO — SIMULATED AI INTERVIEW/i)).toBeInTheDocument();
    expect(screen.getByText(/HEYGEN_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/HEYGEN_AVATAR_ID/)).toBeInTheDocument();
    expect(screen.getByText("See setup")).toHaveAttribute("href", "/about");
  });

  it("hides the setup hint when live video is configured", () => {
    render(<AvatarModeNotice liveConfigured language="en" />);
    expect(screen.queryByText(/HEYGEN_API_KEY/)).not.toBeInTheDocument();
  });

  it("lists the full missing configuration when provided", () => {
    render(
      <AvatarModeNotice
        liveConfigured={false}
        issues={["HEYGEN_API_KEY", "HEYGEN_AVATAR_ID"]}
        language="en"
      />,
    );
    expect(screen.getByText(/HEYGEN_API_KEY, HEYGEN_AVATAR_ID/)).toBeInTheDocument();
  });

  it("uses Portuguese copy for pt sessions", () => {
    render(<AvatarModeNotice liveConfigured={false} language="pt" />);
    expect(screen.getByText(/ENTREVISTA DE IA SIMULADA/)).toBeInTheDocument();
  });
});

describe("LiveHeyGenStage", () => {
  afterEach(() => cleanup());

  const baseProps = {
    sessionToken: null,
    onReady: vi.fn(),
    status: "error" as const,
    videoRef: { current: null },
    error: "provider exploded" as string | null,
    soundOn: false,
    autoplayBlocked: false,
    onEnableSound: vi.fn(),
    onReconnect: vi.fn(),
    onEnd: vi.fn(),
  };

  it("shows a visible, recoverable error without pretending to be connected", () => {
    const onReady = vi.fn();
    render(<LiveHeyGenStage {...baseProps} onReady={onReady} />);
    expect(screen.getByText("provider exploded")).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("offers reconnect and end when the provider disconnects", () => {
    const onReconnect = vi.fn();
    const onEnd = vi.fn();
    render(
      <LiveHeyGenStage
        {...baseProps}
        status="disconnected"
        error={null}
        onReconnect={onReconnect}
        onEnd={onEnd}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reconnect/i }));
    fireEvent.click(screen.getByRole("button", { name: /end interview/i }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("prompts for sound instead of pretending audio is playing", () => {
    const onEnableSound = vi.fn();
    render(
      <LiveHeyGenStage
        {...baseProps}
        status="ready"
        error={null}
        onEnableSound={onEnableSound}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /enable audio/i }));
    expect(onEnableSound).toHaveBeenCalledTimes(1);
  });

  it("starts the SDK session once per token", async () => {
    const onReady = vi.fn();
    const { rerender } = render(
      <LiveHeyGenStage {...baseProps} sessionToken="tok-1" onReady={onReady} status="connecting" error={null} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    rerender(
      <LiveHeyGenStage {...baseProps} sessionToken="tok-1" onReady={onReady} status="connecting" error={null} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
