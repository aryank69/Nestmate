export const LISTING_AVAILABILITY_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "CLOSED",
] as const;

export type ListingAvailabilityStatus =
  (typeof LISTING_AVAILABILITY_STATUSES)[number];

export const DEFAULT_LISTING_STALE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

export function parseListingAvailabilityStatus(value: unknown) {
  return typeof value === "string" &&
    LISTING_AVAILABILITY_STATUSES.includes(
      value as ListingAvailabilityStatus,
    )
    ? (value as ListingAvailabilityStatus)
    : null;
}

export function resolveListingStaleAfterDays(
  value = process.env.LISTING_STALE_AFTER_DAYS,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 365
    ? parsed
    : DEFAULT_LISTING_STALE_AFTER_DAYS;
}

function pluralDays(days: number) {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function listingFreshness(
  status: ListingAvailabilityStatus,
  lastConfirmedAt: Date | string,
  now = new Date(),
  staleAfterDays = resolveListingStaleAfterDays(),
) {
  const confirmedDate = new Date(lastConfirmedAt);
  const confirmedTime = confirmedDate.getTime();
  const ageDays = Number.isFinite(confirmedTime)
    ? Math.max(0, Math.floor((now.getTime() - confirmedTime) / DAY_MS))
    : staleAfterDays;
  const isStale = status !== "CLOSED" && ageDays >= staleAfterDays;
  const label =
    status === "AVAILABLE"
      ? "Available"
      : status === "RESERVED"
        ? "Reserved"
        : "Closed";
  const freshnessLabel =
    status === "CLOSED"
      ? "No longer accepting enquiries"
      : isStale
        ? `Needs confirmation · last checked ${pluralDays(ageDays)} ago`
        : ageDays === 0
          ? "Confirmed today"
          : `Confirmed ${pluralDays(ageDays)} ago`;

  return {
    status,
    label,
    isStale,
    ageDays,
    lastConfirmedAt: confirmedDate.toISOString(),
    freshnessLabel,
  };
}

export function freshnessRecommendationAlignment(input: {
  status: ListingAvailabilityStatus;
  isStale: boolean;
}) {
  if (input.status === "CLOSED") return 0;
  if (input.isStale) return 0.2;
  return input.status === "RESERVED" ? 0.6 : 1;
}

export function rankFreshListingsFirst<
  T extends { availability: { isStale: boolean } },
>(listings: T[]) {
  return [...listings].sort(
    (first, second) =>
      Number(first.availability.isStale) - Number(second.availability.isStale),
  );
}
