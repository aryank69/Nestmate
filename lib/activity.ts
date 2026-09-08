import type {
  ActivityFilters,
  ActivitySignal,
  ActivitySource,
  InterestStage,
  InterestTargetType,
  ProgressMetrics,
  ProgressVisitSignal,
} from "@/types/activity";

export const INTEREST_STAGES = [
  "INTERESTED",
  "CONTACTED",
  "VISIT_PLANNED",
  "SHORTLISTED",
  "FINALIZED",
  "NOT_INTERESTED",
] as const satisfies readonly InterestStage[];

export const INTEREST_TARGET_TYPES = [
  "LISTING",
  "FLATMATE",
] as const satisfies readonly InterestTargetType[];

export const INTEREST_STAGE_LABELS: Record<InterestStage, string> = {
  INTERESTED: "Interested",
  CONTACTED: "Contacted",
  VISIT_PLANNED: "Visit planned",
  SHORTLISTED: "Shortlisted",
  FINALIZED: "Finalized",
  NOT_INTERESTED: "Not interested",
};

export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  MANUAL: "Updated by you",
  SAVED: "From your saved items",
  CHAT: "From private message activity",
  VISIT: "From your visit activity",
};

export function isInterestStage(value: unknown): value is InterestStage {
  return typeof value === "string" && INTEREST_STAGES.includes(value as InterestStage);
}

export function isInterestTargetType(value: unknown): value is InterestTargetType {
  return typeof value === "string" && INTEREST_TARGET_TYPES.includes(value as InterestTargetType);
}

export function parseActivityFilters(input: Record<string, string | string[] | undefined>): ActivityFilters {
  const rawStage = Array.isArray(input.stage) ? input.stage[0] : input.stage;
  const rawType = Array.isArray(input.type) ? input.type[0] : input.type;
  return {
    stage: isInterestStage(rawStage) ? rawStage : null,
    targetType: isInterestTargetType(rawType) ? rawType : null,
  };
}

export function activityTargetKey(signal: Pick<ActivitySignal, "targetType" | "targetId">) {
  return `${signal.targetType}:${signal.targetId}`;
}

const sourcePriority: Record<ActivitySource, number> = {
  MANUAL: 4,
  VISIT: 3,
  CHAT: 2,
  SAVED: 1,
};

export function mergeActivitySignals(signals: ActivitySignal[]) {
  const merged = new Map<string, ActivitySignal>();
  for (const signal of signals) {
    const key = activityTargetKey(signal);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, signal);
      continue;
    }
    const currentTime = new Date(current.occurredAt).getTime();
    const nextTime = new Date(signal.occurredAt).getTime();
    if (
      nextTime > currentTime ||
      (nextTime === currentTime && sourcePriority[signal.source] > sourcePriority[current.source])
    ) {
      merged.set(key, signal);
    }
  }
  return [...merged.values()].sort(
    (first, second) =>
      new Date(second.occurredAt).getTime() - new Date(first.occurredAt).getTime(),
  );
}

export function visitStage(input: {
  status: "PENDING" | "PROPOSED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  outcome?: "INTERESTED" | "NOT_SUITABLE" | "FINALIZED" | "NO_SHOW" | null;
}): InterestStage {
  if (input.outcome === "FINALIZED") return "FINALIZED";
  if (input.outcome === "NOT_SUITABLE" || input.outcome === "NO_SHOW") {
    return "NOT_INTERESTED";
  }
  if (input.outcome === "INTERESTED" || input.status === "DECLINED" || input.status === "CANCELLED") {
    return "INTERESTED";
  }
  return "VISIT_PLANNED";
}

export function emptyActivityCounts(): Record<InterestStage, number> {
  return Object.fromEntries(INTEREST_STAGES.map((stage) => [stage, 0])) as Record<InterestStage, number>;
}

export function calculateProgressMetrics(
  currentSignals: ActivitySignal[],
  visits: ProgressVisitSignal[],
  now = new Date(),
): ProgressMetrics {
  const stageCount = (stage: InterestStage) =>
    currentSignals.filter((signal) => signal.stage === stage).length;
  const completedVisitTargets = new Set<string>();
  const plannedVisitTargets = new Set<string>();

  for (const visit of visits) {
    const scheduledTime = visit.scheduledAt
      ? new Date(visit.scheduledAt).getTime()
      : Number.POSITIVE_INFINITY;
    const completed = visit.attendanceConfirmation
      ? visit.attendanceConfirmation === "HAPPENED"
      : visit.hasOutcome ||
        (visit.status === "ACCEPTED" && scheduledTime <= now.getTime());
    if (completed) {
      completedVisitTargets.add(visit.targetId);
      plannedVisitTargets.delete(visit.targetId);
      continue;
    }
    if (
      (visit.status === "PENDING" ||
        visit.status === "PROPOSED" ||
        visit.status === "ACCEPTED") &&
      !completedVisitTargets.has(visit.targetId)
    ) {
      plannedVisitTargets.add(visit.targetId);
    }
  }

  return {
    activeOptions: currentSignals.filter(
      ({ stage }) => stage !== "FINALIZED" && stage !== "NOT_INTERESTED",
    ).length,
    contacted: stageCount("CONTACTED"),
    visitsPlanned: plannedVisitTargets.size,
    visitsCompleted: completedVisitTargets.size,
    shortlisted: stageCount("SHORTLISTED"),
    finalized: stageCount("FINALIZED"),
    dropped: stageCount("NOT_INTERESTED"),
  };
}
