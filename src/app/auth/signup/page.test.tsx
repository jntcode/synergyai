// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignUpPage from "@/app/auth/signup/page";

const healthState: { supabase: boolean } = { supabase: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/hooks", () => ({
  useHealth: () => ({
    health: {
      ok: true,
      features: {
        supabase: healthState.supabase,
        supabaseSecret: false,
        openai: false,
        heygen: false,
        avatarProvider: "demo",
        auth: healthState.supabase ? "supabase" : "demo",
        demoMode: !healthState.supabase,
      },
    },
    loading: false,
  }),
}));

beforeEach(() => {
  healthState.supabase = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sign-up page without Supabase", () => {
  it("renders guidance and a working demo path, and disables real signup", () => {
    healthState.supabase = false;
    render(<SignUpPage />);

    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
    // Honest limitation note is present.
    expect(screen.getByText(/does not create a persistent account/i)).toBeInTheDocument();

    // Real signup form is present but disabled (no backend).
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/^password/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /create account \(not configured\)/i }),
    ).toBeDisabled();

    // Demo CTA is enabled and labeled honestly.
    const demoBtn = screen.getByRole("button", { name: /continue in demo mode/i });
    expect(demoBtn).toBeEnabled();

    // Actionable setup guidance.
    expect(screen.getByText(/NEXT_PUBLIC_SUPABASE_URL/)).toBeInTheDocument();
    expect(screen.getByText(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)).toBeInTheDocument();
  });

  it("shows a visible error when the demo endpoint is unreachable", async () => {
    healthState.supabase = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const user = userEvent.setup();
    render(<SignUpPage />);

    await user.click(screen.getByRole("button", { name: /continue in demo mode/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not start demo mode/i)).toBeInTheDocument();
    });
  });

  it("surfaces the server's actionable demo-disabled message when configured", async () => {
    healthState.supabase = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "demo_disabled",
                message: "Demo mode is disabled because Supabase is configured.",
              },
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();
    render(<SignUpPage />);

    await user.click(screen.getByRole("button", { name: /continue in demo mode/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/demo mode is disabled because supabase is configured/i),
      ).toBeInTheDocument();
    });
  });
});

describe("Sign-up page with Supabase configured", () => {
  it("enables real signup and disables the demo bypass", () => {
    healthState.supabase = true;
    render(<SignUpPage />);

    expect(screen.getByLabelText(/email/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /^create account$/i })).toBeEnabled();
    // Demo CTA is disabled when real auth is present (not offered).
    expect(screen.getByRole("button", { name: /continue in demo mode/i })).toBeDisabled();
    // No setup guidance banner.
    expect(screen.queryByText(/NEXT_PUBLIC_SUPABASE_URL/)).not.toBeInTheDocument();
  });

  it("signs up through Supabase and shows the email-confirmation step", async () => {
    healthState.supabase = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, needsEmailConfirmation: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const user = userEvent.setup();
    render(<SignUpPage />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.type(screen.getByLabelText(/confirm password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    });
  });
});
