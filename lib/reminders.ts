import type {
  ReminderCandidate,
  ReminderItem,
  ReminderKind,
  ReminderTargetType,
} from "@/types/reminder";

export const REMINDER_UPCOMING_VISIT_DAYS = 7;
export const REMINDER_FOLLOW_UP_HOURS = 24;
export const REMINDER_SHORTLIST_IDLE_DAYS = 7;
export const REMINDER_MOVE_IN_DAYS = 14;
export const REMINDER_SNOOZE_DAYS = [1, 3, 7] as const;

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  UPCOMING_VISIT: "Upcoming visit",
  CHAT_FOLLOW_UP: "Follow up",
  SHORTLIST_IDLE: "Shortlist check-in",
  MOVE_IN_APPROACHING: "Move-in approaching",
};

export function reminderKey(
  kind: ReminderKind,
  targetType: ReminderTargetType,
  targetId: string,
) {
  return `${kind}:${targetType}:${targetId}`;
}

export function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addHours(value: Date, hours: number) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

export function isDateWithinWindow(
  value: Date | string | null,
  now: Date,
  windowDays: number,
) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return (
    Number.isFinite(timestamp) &&
    timestamp >= today &&
    timestamp <= addDays(new Date(today), windowDays).getTime()
  );
}

export function isReminderVisible(
  reminder: Pick<ReminderItem, "dismissedAt" | "snoozedUntil">,
  now = new Date(),
) {
  if (reminder.dismissedAt) return false;
  return !reminder.snoozedUntil || new Date(reminder.snoozedUntil).getTime() <= now.getTime();
}

export function snoozeUntil(days: number, now = new Date()) {
  return REMINDER_SNOOZE_DAYS.includes(days as 1 | 3 | 7)
    ? addDays(now, days)
    : null;
}

export function sortReminderCandidates(candidates: ReminderCandidate[]) {
  return [...candidates].sort(
    (first, second) =>
      new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime() ||
      first.reminderKey.localeCompare(second.reminderKey),
  );
}
