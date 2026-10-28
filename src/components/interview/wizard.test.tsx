// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InterviewWizard } from "@/components/interview/wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("InterviewWizard step 0 → 1", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("advances to settings when title + description are valid", async () => {
    const user = userEvent.setup();
    render(<InterviewWizard />);

    expect(screen.getByText("Which role are you practicing for?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /use sample posting/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Configure the interview")).toBeInTheDocument();
    });
  });

  it("stays on step 0 and lists the failing fields when they are empty", async () => {
    const user = userEvent.setup();
    render(<InterviewWizard />);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Fix these before continuing")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Job title: This field is required"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Job description: Paste the full job description (at least 80 characters)",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Configure the interview")).not.toBeInTheDocument();
  });

  it("rejects a too-short job description with a visible message", async () => {
    const user = userEvent.setup();
    render(<InterviewWizard />);

    await user.type(screen.getByLabelText(/job title/i), "Frontend Engineer");
    await user.type(screen.getByLabelText(/job description/i), "Too short");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Fix these before continuing")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Job description: Paste the full job description (at least 80 characters)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/job description/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByText("Configure the interview")).not.toBeInTheDocument();
  });
});
