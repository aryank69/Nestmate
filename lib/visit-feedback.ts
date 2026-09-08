import type {
  VisitAttendanceConfirmation,
  VisitOutcomeType,
  VisitRequestStatus,
} from "@/types/visit";

export const VISIT_FEEDBACK_MIN_RATING = 1;
export const VISIT_FEEDBACK_MAX_RATING = 5;
export const MAX_VISIT_FEEDBACK_NOTE_LENGTH = 1000;
export const VISIT_FEEDBACK_AGGREGATE_MIN_RESPONSES = 3;

export type VisitFeedbackRatings = {
  propertyAccuracy: number;
  cleanliness: number;
  communicationQuality: number;
  safetyComfort: number;
  overallExperience: number;
};

const ratingFields = [
  "propertyAccuracy",
  "cleanliness",
  "communicationQuality",
  "safetyComfort",
  "overallExperience",
] as const satisfies ReadonlyArray<keyof VisitFeedbackRatings>;

export function parseVisitFeedbackRatings(
  input: Record<string, unknown>,
): VisitFeedbackRatings | null {
  const parsed = {} as VisitFeedbackRatings;
  for (const field of ratingFields) {
    const value = typeof input[field] === "number"
      ? input[field]
      : Number(input[field]);
    if (
      !Number.isInteger(value) ||
      value < VISIT_FEEDBACK_MIN_RATING ||
      value > VISIT_FEEDBACK_MAX_RATING
    ) {
      return null;
    }
    parsed[field] = value;
  }
  return parsed;
}

export function cleanVisitFeedbackNote(value: string) {
  return value.trim().slice(0, MAX_VISIT_FEEDBACK_NOTE_LENGTH) || null;
}

export function canSubmitVisitFeedback(
  visit: {
    status: VisitRequestStatus;
    scheduledAt: string | Date | null;
    attendanceConfirmation?: VisitAttendanceConfirmation | null;
    outcome?: VisitOutcomeType | null;
    hasExistingFeedback?: boolean;
  },
  now = new Date(),
) {
  if (visit.status !== "ACCEPTED" || !visit.scheduledAt) {
    return { eligible: false, reason: "Feedback is available after an accepted visit." };
  }
  const scheduledAt = new Date(visit.scheduledAt).getTime();
  if (
    !Number.isFinite(scheduledAt) ||
    now.getTime() < scheduledAt + 60 * 60_000
  ) {
    return { eligible: false, reason: "Feedback opens after the scheduled visit ends." };
  }
  if (visit.hasExistingFeedback) {
    return { eligible: true, reason: "You can update your private feedback." };
  }
  const completedByAttendance = visit.attendanceConfirmation === "HAPPENED";
  const completedLegacyOutcome = Boolean(
    visit.outcome && visit.outcome !== "NO_SHOW",
  );
  if (!completedByAttendance && !completedLegacyOutcome) {
    return {
      eligible: false,
      reason: "Confirm that the visit happened before sharing feedback.",
    };
  }
  return { eligible: true, reason: "Private feedback is available." };
}
