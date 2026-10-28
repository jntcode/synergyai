export type SessionStatus =
  | "draft"
  | "preparing"
  | "ready"
  | "connecting"
  | "in_progress"
  | "evaluating"
  | "completed"
  | "failed"
  | "cancelled";

const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  draft: ["preparing", "cancelled"],
  preparing: ["ready", "failed", "cancelled"],
  ready: ["connecting", "cancelled"],
  connecting: ["in_progress", "failed", "cancelled"],
  in_progress: ["evaluating", "failed", "cancelled", "completed"],
  evaluating: ["completed", "failed"],
  completed: [],
  failed: ["cancelled"],
  cancelled: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: SessionStatus): readonly SessionStatus[] {
  return TRANSITIONS[from];
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: SessionStatus,
    public readonly to: SessionStatus,
  ) {
    super(`Invalid interview status transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const TERMINAL_STATUSES: readonly SessionStatus[] = ["completed", "cancelled"];

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isActive(status: SessionStatus): boolean {
  return status === "in_progress" || status === "connecting";
}
