import type { ResponsivenessIndicator } from "@/types/responsiveness";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const MIN_RESPONSE_SAMPLES = 3;
export const QUICK_RESPONSE_HOURS = 12;
export const RECENT_ACTIVITY_DAYS = 14;
export const LIMITED_ACTIVITY_DAYS = 45;

export type ResponsivenessEvidence = {
  responseDelayHours: number[];
  activityCount: number;
  latestActivityAt: Date | string | null;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function activityAgeDays(value: Date | string | null, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS))
    : null;
}

export function responseDelayHours(
  receivedAt: Date | string,
  repliedAt: Date | string,
) {
  const receivedTime = new Date(receivedAt).getTime();
  const repliedTime = new Date(repliedAt).getTime();
  if (!Number.isFinite(receivedTime) || !Number.isFinite(repliedTime)) return null;
  const delay = (repliedTime - receivedTime) / HOUR_MS;
  return delay >= 0 ? delay : null;
}

export function calculateResponsiveness(
  evidence: ResponsivenessEvidence,
  now = new Date(),
): ResponsivenessIndicator {
  const delays = evidence.responseDelayHours.filter(
    (delay) => Number.isFinite(delay) && delay >= 0,
  );
  const typicalDelay = median(delays);
  const latestActivityAge = activityAgeDays(evidence.latestActivityAt, now);
  const hasResponseHistory = delays.length >= MIN_RESPONSE_SAMPLES;
  const hasActivityHistory = evidence.activityCount >= MIN_RESPONSE_SAMPLES;

  if (hasResponseHistory && typicalDelay !== null && typicalDelay <= QUICK_RESPONSE_HOURS) {
    return {
      level: "quick",
      label: "Usually responds quickly",
      description: "Based on a consistent, privacy-safe response pattern.",
      recommendationAlignment: 1,
    };
  }

  if (
    hasActivityHistory &&
    latestActivityAge !== null &&
    latestActivityAge <= RECENT_ACTIVITY_DAYS
  ) {
    return {
      level: "active",
      label: "Active recently",
      description: "Based on broad recent NestMate activity, not online status.",
      recommendationAlignment: 0.7,
    };
  }

  if (
    hasActivityHistory &&
    latestActivityAge !== null &&
    latestActivityAge >= LIMITED_ACTIVITY_DAYS
  ) {
    return {
      level: "limited",
      label: "Limited activity",
      description: "Recent activity is limited; response times can still vary.",
      recommendationAlignment: 0.35,
    };
  }

  return {
    level: "neutral",
    label: "Response history building",
    description: "Not enough history to estimate responsiveness yet.",
    recommendationAlignment: null,
  };
}

export function latestDate(
  values: Array<Date | string | null | undefined>,
) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return latest;
    return !latest || date > latest ? date : latest;
  }, null);
}
