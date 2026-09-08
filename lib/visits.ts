import type {
  VisitRequestStatus,
  VisitResponseAction,
} from "@/types/visit";

export const MAX_VISIT_NOTE_LENGTH = 500;
export const MAX_VISIT_DAYS_AHEAD = 180;
export const MIN_VISIT_LEAD_MINUTES = 30;

export function parseVisitDate(
  value: unknown,
  now = new Date(),
): Date | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const date = new Date(value);
  const earliest = now.getTime() + MIN_VISIT_LEAD_MINUTES * 60_000;
  const latest = now.getTime() + MAX_VISIT_DAYS_AHEAD * 86_400_000;
  return Number.isFinite(date.getTime()) &&
    date.getTime() >= earliest &&
    date.getTime() <= latest
    ? date
    : null;
}

export function cleanVisitNote(value: unknown) {
  if (typeof value !== "string") return null;
  const note = value.trim();
  return note ? note.slice(0, MAX_VISIT_NOTE_LENGTH) : null;
}

export function parseVisitResponseAction(
  value: unknown,
): VisitResponseAction | null {
  return value === "ACCEPT" ||
    value === "DECLINE" ||
    value === "PROPOSE" ||
    value === "ACCEPT_PROPOSAL" ||
    value === "DECLINE_PROPOSAL"
    ? value
    : null;
}

export function canRespondToVisit(input: {
  role: "OWNER" | "REQUESTER";
  status: VisitRequestStatus;
  action: VisitResponseAction;
}) {
  if (input.role === "OWNER") {
    return (
      (input.status === "PENDING" || input.status === "PROPOSED") &&
      (input.action === "ACCEPT" ||
        input.action === "DECLINE" ||
        input.action === "PROPOSE")
    );
  }
  return (
    input.status === "PROPOSED" &&
    (input.action === "ACCEPT_PROPOSAL" ||
      input.action === "DECLINE_PROPOSAL" ||
      input.action === "PROPOSE")
  );
}

export function visitStatusLabel(status: VisitRequestStatus) {
  if (status === "CANCELLED") return "Visit cancelled";
  if (status === "PENDING") return "Awaiting owner response";
  if (status === "PROPOSED") return "New time proposed";
  if (status === "ACCEPTED") return "Visit confirmed";
  return "Visit declined";
}

export function visitEventAt(input: {
  status: VisitRequestStatus;
  requestedAt: string;
  proposedAt: string | null;
  scheduledAt: string | null;
}) {
  return input.scheduledAt ?? input.proposedAt ?? input.requestedAt;
}

export function isPastVisit(
  input: {
    status: VisitRequestStatus;
    requestedAt: string;
    proposedAt: string | null;
    scheduledAt: string | null;
  },
  now = new Date(),
) {
  return (
    input.status === "DECLINED" ||
    input.status === "CANCELLED" ||
    new Date(visitEventAt(input)).getTime() < now.getTime()
  );
}
