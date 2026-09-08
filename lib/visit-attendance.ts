import type {
  VisitAttendanceConfirmation,
  VisitRequestStatus,
} from "@/types/visit";

export const VISIT_DURATION_MINUTES = 60;
export const VISIT_CHECK_IN_EARLY_MINUTES = 30;
export const VISIT_CHECK_IN_LATE_MINUTES = 120;

const confirmations = new Set<VisitAttendanceConfirmation>([
  "HAPPENED",
  "MISSED",
  "CANCELLED",
]);

export function parseVisitAttendanceConfirmation(
  value: unknown,
): VisitAttendanceConfirmation | null {
  return typeof value === "string" &&
    confirmations.has(value as VisitAttendanceConfirmation)
    ? (value as VisitAttendanceConfirmation)
    : null;
}

export function visitAttendanceLabel(value: VisitAttendanceConfirmation) {
  if (value === "HAPPENED") return "Visit happened";
  if (value === "MISSED") return "Visit was missed";
  return "Visit was cancelled";
}

type ListingState = {
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  moderationStatus: "VISIBLE" | "HIDDEN";
  availabilityStatus: "AVAILABLE" | "RESERVED" | "CLOSED";
  publishedAt: string | Date | null;
};

type VisitState = {
  status: VisitRequestStatus;
  scheduledAt: string | Date | null;
};

function scheduledTime(visit: VisitState) {
  if (!visit.scheduledAt) return null;
  const value = new Date(visit.scheduledAt).getTime();
  return Number.isFinite(value) ? value : null;
}

export function visitCheckInEligibility(
  visit: VisitState & { post: ListingState },
  now = new Date(),
) {
  if (visit.status !== "ACCEPTED") {
    return { eligible: false, reason: "Only accepted visits can be checked in." };
  }
  if (
    visit.post.status !== "ACTIVE" ||
    visit.post.moderationStatus !== "VISIBLE" ||
    !visit.post.publishedAt ||
    !["AVAILABLE", "RESERVED"].includes(visit.post.availabilityStatus)
  ) {
    return { eligible: false, reason: "This listing is not available for check-in." };
  }
  const scheduledAt = scheduledTime(visit);
  if (scheduledAt === null) {
    return { eligible: false, reason: "This visit does not have a confirmed time." };
  }
  const current = now.getTime();
  const opensAt = scheduledAt - VISIT_CHECK_IN_EARLY_MINUTES * 60_000;
  const closesAt = scheduledAt + VISIT_CHECK_IN_LATE_MINUTES * 60_000;
  if (current < opensAt) {
    return { eligible: false, reason: "Check-in opens 30 minutes before the visit." };
  }
  if (current > closesAt) {
    return { eligible: false, reason: "The check-in window has closed." };
  }
  return { eligible: true, reason: "Check-in is available now." };
}

export function visitAttendanceConfirmationEligibility(
  visit: VisitState,
  now = new Date(),
) {
  if (!(["ACCEPTED", "CANCELLED"] as VisitRequestStatus[]).includes(visit.status)) {
    return { eligible: false, reason: "Attendance is only available for confirmed visits." };
  }
  const scheduledAt = scheduledTime(visit);
  if (scheduledAt === null) {
    return { eligible: false, reason: "This visit does not have a confirmed time." };
  }
  if (now.getTime() < scheduledAt + VISIT_DURATION_MINUTES * 60_000) {
    return { eligible: false, reason: "Confirm attendance after the scheduled visit ends." };
  }
  return { eligible: true, reason: "Attendance confirmation is available." };
}

export function visitCountsAsCompleted(input: {
  status: VisitRequestStatus;
  scheduledAt: string | null;
  hasOutcome: boolean;
  attendanceConfirmation?: VisitAttendanceConfirmation | null;
}, now = new Date()) {
  if (input.attendanceConfirmation) {
    return input.attendanceConfirmation === "HAPPENED";
  }
  const scheduledAt = input.scheduledAt
    ? new Date(input.scheduledAt).getTime()
    : Number.POSITIVE_INFINITY;
  return input.hasOutcome ||
    (input.status === "ACCEPTED" && scheduledAt <= now.getTime());
}
