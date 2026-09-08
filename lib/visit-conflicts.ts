export const VISIT_SLOT_MINUTES = 60;
export const VISIT_SUGGESTION_TIME_ZONE = "Asia/Kolkata";

const MINUTE_MS = 60_000;
const SUGGESTION_OFFSETS_MINUTES = [
  -120,
  -60,
  60,
  120,
  24 * 60,
  25 * 60,
  48 * 60,
] as const;

export function visitTimesOverlap(
  firstStart: Date | string,
  secondStart: Date | string,
  slotMinutes = VISIT_SLOT_MINUTES,
) {
  const first = new Date(firstStart).getTime();
  const second = new Date(secondStart).getTime();
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(second) ||
    !Number.isSafeInteger(slotMinutes) ||
    slotMinutes <= 0
  ) {
    return false;
  }
  const duration = slotMinutes * MINUTE_MS;
  return first < second + duration && second < first + duration;
}

export function suggestAlternativeVisitTimes(input: {
  requestedAt: Date | string;
  occupiedStarts: Array<Date | string>;
  now?: Date;
  limit?: number;
}) {
  const requestedAt = new Date(input.requestedAt);
  const now = input.now ?? new Date();
  const earliest = now.getTime() + 30 * MINUTE_MS;
  const latest = now.getTime() + 180 * 24 * 60 * MINUTE_MS;
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 5);
  if (!Number.isFinite(requestedAt.getTime())) return [];

  return SUGGESTION_OFFSETS_MINUTES.map(
    (offset) => new Date(requestedAt.getTime() + offset * MINUTE_MS),
  )
    .filter(
      (candidate) =>
        candidate.getTime() >= earliest &&
        candidate.getTime() <= latest &&
        !input.occupiedStarts.some((occupied) =>
          visitTimesOverlap(candidate, occupied),
        ),
    )
    .slice(0, limit);
}

export function formatVisitConflictMessage(alternatives: Date[]) {
  if (!alternatives.length) {
    return "That time is unavailable. Choose another time at least one hour away.";
  }
  const formatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: VISIT_SUGGESTION_TIME_ZONE,
  });
  return `That time is unavailable. Try ${alternatives
    .map((value) => formatter.format(value))
    .join(", ")}.`;
}

export function visitListingEligibility(input: {
  status: string;
  moderationStatus: string;
  availabilityStatus: string;
  publishedAt: Date | string | null;
}) {
  if (
    input.status !== "ACTIVE" ||
    input.moderationStatus !== "VISIBLE" ||
    !input.publishedAt
  ) {
    return "This listing is unavailable for visits.";
  }
  if (input.availabilityStatus === "RESERVED") {
    return "This listing is reserved and is not accepting new visit requests.";
  }
  if (input.availabilityStatus === "CLOSED") {
    return "This listing is closed and is not accepting visit requests.";
  }
  return input.availabilityStatus === "AVAILABLE"
    ? null
    : "This listing is unavailable for visits.";
}
