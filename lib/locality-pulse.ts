import type {
  LocalityPulse,
  LocalityPulseMetric,
} from "@/types/locality-pulse";

export const LOCALITY_PULSE_MINIMUM_SAMPLE_SIZE = 5;

export type LocalityPulseAggregate = {
  activeListings: number;
  peopleSearching: number;
  rentSampleSize: number;
  medianRent: number | null;
  depositSampleSize: number;
  medianDeposit: number | null;
  freshListingCount: number;
  recentSupply: number;
  recentDemand: number;
  previousSupply: number;
  previousDemand: number;
  moveInSampleSize: number;
  moveInSoon: number;
  moveInOneToTwoMonths: number;
  moveInTwoToThreeMonths: number;
  moveInLater: number;
  commuteSampleSize: number;
  medianPreferredCommuteKm: number | null;
};

function available<T extends string | number>(
  value: T,
  detail: string,
): LocalityPulseMetric<T> {
  return { status: "AVAILABLE", value, detail };
}
function insufficient<T extends string | number>(
  detail: string,
): LocalityPulseMetric<T> {
  return { status: "INSUFFICIENT", value: null, detail };
}

function hasMinimumSample(value: number, minimumSampleSize: number) {
  return Number.isFinite(value) && value >= minimumSampleSize;
}

function formatRupees(value: number) {
  const privacyRoundedValue = Math.round(value / 500) * 500;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(privacyRoundedValue);
}

function freshnessMetric(
  aggregate: LocalityPulseAggregate,
  minimumSampleSize: number,
  staleAfterDays: number,
): LocalityPulseMetric {
  if (!hasMinimumSample(aggregate.activeListings, minimumSampleSize)) {
    return insufficient("Not enough active listings to describe freshness.");
  }

  const roundedPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (aggregate.freshListingCount / aggregate.activeListings) * 10,
      ) * 10,
    ),
  );

  return available(
    `About ${roundedPercent}% recently confirmed`,
    `Broad share refreshed within ${staleAfterDays} days.`,
  );
}

function trendMetric(
  aggregate: LocalityPulseAggregate,
  minimumSampleSize: number,
): LocalityPulseMetric {
  const recentTotal = aggregate.recentSupply + aggregate.recentDemand;
  const previousTotal = aggregate.previousSupply + aggregate.previousDemand;
  if (
    !hasMinimumSample(recentTotal, minimumSampleSize) ||
    !hasMinimumSample(previousTotal, minimumSampleSize)
  ) {
    return insufficient("Not enough activity across both 30-day periods.");
  }

  const recentSupplyShare = aggregate.recentSupply / recentTotal;
  const previousSupplyShare = aggregate.previousSupply / previousTotal;
  const shift = recentSupplyShare - previousSupplyShare;
  const label =
    shift >= 0.12
      ? "Supply gaining"
      : shift <= -0.12
        ? "Demand gaining"
        : recentSupplyShare >= 0.6
          ? "Supply-led activity"
          : recentSupplyShare <= 0.4
            ? "Demand-led activity"
            : "Supply and demand are balanced";

  return available(label, "Recent 30-day mix compared with the prior period.");
}

function moveInMetric(
  aggregate: LocalityPulseAggregate,
  minimumSampleSize: number,
): LocalityPulseMetric {
  if (!hasMinimumSample(aggregate.moveInSampleSize, minimumSampleSize)) {
    return insufficient("Not enough move-in dates to identify a pattern.");
  }

  const minimumBucketSize = Math.max(2, Math.ceil(minimumSampleSize / 2));
  const buckets = [
    { label: "Ready now or next 30 days", count: aggregate.moveInSoon, order: 0 },
    { label: "1–2 months", count: aggregate.moveInOneToTwoMonths, order: 1 },
    { label: "2–3 months", count: aggregate.moveInTwoToThreeMonths, order: 2 },
    { label: "More than 3 months", count: aggregate.moveInLater, order: 3 },
  ]
    .filter(({ count }) => count >= minimumBucketSize)
    .sort((first, second) => second.count - first.count || first.order - second.order);

  if (!buckets.length) {
    return insufficient("Move-in dates are too spread out for a safe summary.");
  }

  return available(
    buckets.slice(0, 2).map(({ label }) => label).join(" · "),
    "Most common broad move-in windows; individual dates stay private.",
  );
}

function commuteMetric(
  aggregate: LocalityPulseAggregate,
  minimumSampleSize: number,
): LocalityPulseMetric {
  if (
    !hasMinimumSample(aggregate.commuteSampleSize, minimumSampleSize) ||
    aggregate.medianPreferredCommuteKm === null
  ) {
    return insufficient("Not enough private commute preferences to summarize.");
  }

  const median = aggregate.medianPreferredCommuteKm;
  const range =
    median <= 5
      ? "Up to 5 km"
      : median <= 10
        ? "5–10 km"
        : median <= 20
          ? "10–20 km"
          : "20+ km";

  return available(
    `${range} preferred commute`,
    "Only a broad range is shown; destinations and coordinates stay private.",
  );
}

export function buildLocalityPulse(
  aggregate: LocalityPulseAggregate,
  options: {
    minimumSampleSize?: number;
    staleAfterDays?: number;
  } = {},
): LocalityPulse {
  const minimumSampleSize = Math.max(
    LOCALITY_PULSE_MINIMUM_SAMPLE_SIZE,
    Math.floor(options.minimumSampleSize ?? LOCALITY_PULSE_MINIMUM_SAMPLE_SIZE),
  );
  const staleAfterDays = Math.max(1, Math.floor(options.staleAfterDays ?? 30));

  return {
    minimumSampleSize,
    activeListings: hasMinimumSample(
      aggregate.activeListings,
      minimumSampleSize,
    )
      ? available(
          aggregate.activeListings,
          "Available or reserved Room and PG listings.",
        )
      : insufficient("Not enough active housing listings to show a count."),
    peopleSearching: hasMinimumSample(
      aggregate.peopleSearching,
      minimumSampleSize,
    )
      ? available(
          aggregate.peopleSearching,
          "Distinct people with an active Room or Flatmate search post.",
        )
      : insufficient("Not enough active searchers to show a count."),
    medianRent:
      hasMinimumSample(aggregate.rentSampleSize, minimumSampleSize) &&
      aggregate.medianRent !== null
        ? available(
            `${formatRupees(aggregate.medianRent)}/month`,
            "Privacy-rounded median asking rent for active housing listings.",
          )
        : insufficient("Not enough rent values for a reliable median."),
    typicalDeposit:
      hasMinimumSample(aggregate.depositSampleSize, minimumSampleSize) &&
      aggregate.medianDeposit !== null
        ? available(
            formatRupees(aggregate.medianDeposit),
            "Privacy-rounded median advertised deposit.",
          )
        : insufficient("Not enough deposit values for a reliable median."),
    listingFreshness: freshnessMetric(
      aggregate,
      minimumSampleSize,
      staleAfterDays,
    ),
    supplyDemandTrend: trendMetric(aggregate, minimumSampleSize),
    popularMoveInPeriod: moveInMetric(aggregate, minimumSampleSize),
    commutePattern: commuteMetric(aggregate, minimumSampleSize),
  };
}
