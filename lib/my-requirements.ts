export const RECENT_REQUIREMENT_ACTIVITY_DAYS = 14;

export function requirementKind(type: string) {
  return type === "NEED_FLATMATE"
    ? ("Need a Flatmate" as const)
    : ("Need a Room" as const);
}

export function recentRequirementActivity(
  activityDates: Array<Date | string>,
  now = new Date(),
  recentDays = RECENT_REQUIREMENT_ACTIVITY_DAYS,
) {
  const validDates = activityDates
    .map((value) => (value instanceof Date ? value : new Date(value)))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((first, second) => second.getTime() - first.getTime());
  const boundary = now.getTime() - recentDays * 24 * 60 * 60 * 1000;
  const count = validDates.filter((value) => value.getTime() >= boundary).length;
  const latest = validDates[0];

  if (!latest) return { count: 0, label: "No activity yet" };
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return {
    count,
    label:
      ageDays === 0
        ? "Activity today"
        : ageDays === 1
          ? "Activity yesterday"
          : `Last activity ${ageDays} days ago`,
  };
}
