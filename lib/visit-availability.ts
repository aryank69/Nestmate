export const VISIT_AVAILABILITY_TIME_ZONE = "Asia/Kolkata";
export const VISIT_AVAILABILITY_DAYS = 21;
export const VISIT_SLOT_STEP_MINUTES = 30;
export const VISIT_AVAILABILITY_SLOT_MINUTES = 60;
export const INDIA_OFFSET_MINUTES = 330;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type VisitAvailabilityRuleInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type VisitAvailabilityBlockInput = {
  startsAt: Date | string;
  endsAt: Date | string;
};

export type VisitSlotPreferenceInput = {
  preferredWeekdays: number[];
  preferredStartMinute: number | null;
  preferredEndMinute: number | null;
};

export type VisitSlotSuggestionReason =
  | "PREFERRED_DAY"
  | "PREFERRED_TIME"
  | "SOONEST_AVAILABLE";

export type VisitSlotSuggestion = {
  startsAt: string;
  score: number;
  reasons: VisitSlotSuggestionReason[];
};

export const VISIT_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function indiaDateParts(value: Date) {
  const local = new Date(value.getTime() + INDIA_OFFSET_MINUTES * MINUTE_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    date: local.getUTCDate(),
  };
}

function indiaSlotParts(value: Date) {
  const local = new Date(value.getTime() + INDIA_OFFSET_MINUTES * MINUTE_MS);
  return {
    weekday: local.getUTCDay(),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

function indiaLocalToUtc(
  year: number,
  month: number,
  date: number,
  minuteOfDay: number,
) {
  return new Date(
    Date.UTC(year, month, date, 0, minuteOfDay) -
      INDIA_OFFSET_MINUTES * MINUTE_MS,
  );
}

export function intervalsOverlap(
  firstStart: Date | string,
  firstEnd: Date | string,
  secondStart: Date | string,
  secondEnd: Date | string,
) {
  const aStart = new Date(firstStart).getTime();
  const aEnd = new Date(firstEnd).getTime();
  const bStart = new Date(secondStart).getTime();
  const bEnd = new Date(secondEnd).getTime();
  return (
    [aStart, aEnd, bStart, bEnd].every(Number.isFinite) &&
    aStart < bEnd &&
    bStart < aEnd
  );
}

export function generateVisitSlots(input: {
  rules: VisitAvailabilityRuleInput[];
  blocks?: VisitAvailabilityBlockInput[];
  occupiedStarts?: Array<Date | string>;
  now?: Date;
  days?: number;
}) {
  const now = input.now ?? new Date();
  const earliest = now.getTime() + 30 * MINUTE_MS;
  const days = Math.min(Math.max(input.days ?? VISIT_AVAILABILITY_DAYS, 1), 180);
  const rulesByWeekday = new Map(
    input.rules.map((rule) => [rule.weekday, rule]),
  );
  const startParts = indiaDateParts(now);
  const slots: Date[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const localDay = new Date(
      Date.UTC(startParts.year, startParts.month, startParts.date) +
        dayOffset * DAY_MS,
    );
    const rule = rulesByWeekday.get(localDay.getUTCDay());
    if (!rule) continue;

    for (
      let minute = rule.startMinute;
      minute + VISIT_AVAILABILITY_SLOT_MINUTES <= rule.endMinute;
      minute += VISIT_SLOT_STEP_MINUTES
    ) {
      const candidate = indiaLocalToUtc(
        localDay.getUTCFullYear(),
        localDay.getUTCMonth(),
        localDay.getUTCDate(),
        minute,
      );
      const candidateEnd = new Date(
        candidate.getTime() + VISIT_AVAILABILITY_SLOT_MINUTES * MINUTE_MS,
      );
      if (candidate.getTime() < earliest) continue;
      if (
        input.blocks?.some((block) =>
          intervalsOverlap(candidate, candidateEnd, block.startsAt, block.endsAt),
        )
      ) {
        continue;
      }
      if (
        input.occupiedStarts?.some((occupied) =>
          intervalsOverlap(
            candidate,
            candidateEnd,
            occupied,
            new Date(new Date(occupied).getTime() + VISIT_AVAILABILITY_SLOT_MINUTES * MINUTE_MS),
          ),
        )
      ) {
        continue;
      }
      slots.push(candidate);
    }
  }

  return slots;
}

export function normalizeVisitSlotPreference(input: {
  preferredWeekdays?: number[];
  preferredStartMinute?: number | null;
  preferredEndMinute?: number | null;
}): VisitSlotPreferenceInput | null {
  const weekdays = [...new Set(input.preferredWeekdays ?? [])]
    .filter((weekday) => Number.isSafeInteger(weekday) && weekday >= 0 && weekday <= 6)
    .sort((first, second) => first - second);
  const start = input.preferredStartMinute ?? null;
  const end = input.preferredEndMinute ?? null;
  const hasTimeWindow = start !== null || end !== null;
  if (
    hasTimeWindow &&
    (!Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start! < 0 ||
      end! > 1440 ||
      end! - start! < VISIT_AVAILABILITY_SLOT_MINUTES)
  ) {
    return null;
  }
  return {
    preferredWeekdays: weekdays,
    preferredStartMinute: start,
    preferredEndMinute: end,
  };
}

export function rankVisitSlotSuggestions(input: {
  slots: Array<Date | string>;
  preference?: VisitSlotPreferenceInput | null;
  now?: Date;
  limit?: number;
}): VisitSlotSuggestion[] {
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 4, 1), 6);
  const preference = input.preference;
  const hasPreferredDays = Boolean(preference?.preferredWeekdays.length);
  const hasPreferredTime = Boolean(
    preference &&
      preference.preferredStartMinute !== null &&
      preference.preferredEndMinute !== null,
  );

  return input.slots
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()) && value > now)
    .map((value) => {
      const local = indiaSlotParts(value);
      const preferredDay = Boolean(
        hasPreferredDays && preference?.preferredWeekdays.includes(local.weekday),
      );
      const preferredTime = Boolean(
        hasPreferredTime &&
          local.minute >= preference!.preferredStartMinute! &&
          local.minute + VISIT_AVAILABILITY_SLOT_MINUTES <=
            preference!.preferredEndMinute!,
      );
      const hoursAway = Math.max(0, (value.getTime() - now.getTime()) / (60 * MINUTE_MS));
      const soonness = Math.max(0, 20 - Math.floor(hoursAway / 24));
      const reasons: VisitSlotSuggestionReason[] = [];
      if (preferredDay) reasons.push("PREFERRED_DAY");
      if (preferredTime) reasons.push("PREFERRED_TIME");
      if (!reasons.length) reasons.push("SOONEST_AVAILABLE");
      return {
        startsAt: value.toISOString(),
        score: (preferredDay ? 40 : 0) + (preferredTime ? 40 : 0) + soonness,
        reasons,
      };
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.startsAt.localeCompare(second.startsAt),
    )
    .slice(0, limit);
}

export function formatVisitSlot(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: VISIT_AVAILABILITY_TIME_ZONE,
  }).format(new Date(value));
}

export function minuteToTimeValue(minute: number) {
  const hours = Math.floor(minute / 60).toString().padStart(2, "0");
  const minutes = (minute % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function timeValueToMinute(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
