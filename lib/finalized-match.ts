import type {
  FinalizedMatchStatus,
  MatchClosureReason,
} from "@/types/shared-documents";

export const MATCH_REOPEN_WINDOW_DAYS = 7;

export const CLOSURE_REASONS: ReadonlyArray<{
  value: MatchClosureReason;
  label: string;
  description: string;
}> = [
  {
    value: "MOVE_IN_COMPLETED",
    label: "Move-in completed",
    description: "Archive this match after a successful move-in.",
  },
  {
    value: "MOVE_IN_CANCELLED",
    label: "Move-in cancelled",
    description: "Close this match because the planned move-in will not happen.",
  },
  {
    value: "CREATED_BY_MISTAKE",
    label: "Finalized by mistake",
    description: "Close a match that was finalized accidentally.",
  },
  {
    value: "ARCHIVED",
    label: "Archive match",
    description: "Keep the history, but remove the match from active flows.",
  },
] as const;

export const REOPENABLE_CLOSURE_REASONS: ReadonlySet<MatchClosureReason> =
  new Set(["MOVE_IN_CANCELLED", "CREATED_BY_MISTAKE"]);

export function isMatchClosureReason(value: unknown): value is MatchClosureReason {
  return CLOSURE_REASONS.some((item) => item.value === value);
}

export function finalizedMatchStatusLabel(status: FinalizedMatchStatus) {
  if (status === "COMPLETED") return "Move-in completed";
  if (status === "CLOSED") return "Closed archive";
  return "Active match";
}

export function closureReasonLabel(reason: MatchClosureReason | null) {
  return CLOSURE_REASONS.find((item) => item.value === reason)?.label ?? "Closed";
}

export function canReopenFinalizedMatch(input: {
  status: FinalizedMatchStatus;
  closureReason: MatchClosureReason | null;
  closedAt: string | Date | null;
  closedById: string | null;
  viewerId: string;
  now?: Date;
}) {
  if (
    input.status !== "CLOSED" ||
    !input.closureReason ||
    !REOPENABLE_CLOSURE_REASONS.has(input.closureReason) ||
    input.closedById !== input.viewerId ||
    !input.closedAt
  ) {
    return false;
  }

  const closedAt = new Date(input.closedAt).getTime();
  const now = (input.now ?? new Date()).getTime();
  return (
    Number.isFinite(closedAt) &&
    now >= closedAt &&
    now - closedAt <= MATCH_REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
}
