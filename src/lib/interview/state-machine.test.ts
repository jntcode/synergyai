import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isActive,
  InvalidTransitionError,
  isTerminal,
  type SessionStatus,
} from "@/lib/interview/state-machine";

describe("state machine", () => {
  it("allows the happy path draft → … → completed", () => {
    const path: SessionStatus[] = [
      "draft",
      "preparing",
      "ready",
      "connecting",
      "in_progress",
      "evaluating",
      "completed",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("allows in_progress → completed directly", () => {
    expect(canTransition("in_progress", "completed")).toBe(true);
  });

  it("rejects skipping stages", () => {
    expect(canTransition("draft", "in_progress")).toBe(false);
    expect(canTransition("ready", "in_progress")).toBe(false);
    expect(canTransition("preparing", "completed")).toBe(false);
  });

  it("rejects leaving terminal states", () => {
    expect(allowedTransitions("completed")).toHaveLength(0);
    expect(allowedTransitions("cancelled")).toHaveLength(0);
    expect(canTransition("completed", "draft")).toBe(false);
    expect(canTransition("cancelled", "in_progress")).toBe(false);
  });

  it("allows cancelling from non-terminal states", () => {
    for (const s of ["draft", "preparing", "ready", "connecting", "in_progress"] as const) {
      expect(canTransition(s, "cancelled")).toBe(true);
    }
  });

  it("classifies terminal and active states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("failed")).toBe(false);
    expect(isActive("in_progress")).toBe(true);
    expect(isActive("connecting")).toBe(true);
    expect(isActive("completed")).toBe(false);
  });

  it("assertTransition throws InvalidTransitionError with from/to", () => {
    expect(() => assertTransition("draft", "completed")).toThrow(InvalidTransitionError);
    try {
      assertTransition("draft", "completed");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as InvalidTransitionError).from).toBe("draft");
      expect((err as InvalidTransitionError).to).toBe("completed");
    }
    expect(() => assertTransition("draft", "preparing")).not.toThrow();
  });
});
