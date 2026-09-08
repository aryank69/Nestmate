import type {
  VisitOutcomeHistoryItem,
  VisitOutcomeType,
  VisitRequestStatus,
} from "@/types/visit";

export const MAX_VISIT_OUTCOME_NOTE_LENGTH = 500;

const outcomeTypes = new Set<VisitOutcomeType>([
  "INTERESTED",
  "NOT_SUITABLE",
  "FINALIZED",
  "NO_SHOW",
]);

export function parseVisitOutcome(value: unknown): VisitOutcomeType | null {
  return typeof value === "string" && outcomeTypes.has(value as VisitOutcomeType)
    ? (value as VisitOutcomeType)
    : null;
}

export function cleanVisitOutcomeNote(value: string) {
  return value.trim().slice(0, MAX_VISIT_OUTCOME_NOTE_LENGTH) || null;
}

export function canRecordVisitOutcome(
  visit: {
    status: VisitRequestStatus;
    scheduledAt: string | Date | null;
  },
  now = new Date(),
) {
  if (visit.status !== "ACCEPTED" || !visit.scheduledAt) return false;
  const scheduledAt = new Date(visit.scheduledAt);
  return Number.isFinite(scheduledAt.getTime()) && scheduledAt <= now;
}

export function visitOutcomeLabel(outcome: VisitOutcomeType) {
  if (outcome === "INTERESTED") return "Interested";
  if (outcome === "NOT_SUITABLE") return "Not suitable";
  if (outcome === "FINALIZED") return "Finalized";
  return "No show";
}

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase("en-IN");
}

function amountMidpoint(item: {
  monthlyAmountMin: number | null;
  monthlyAmountMax: number | null;
}) {
  if (item.monthlyAmountMin === null && item.monthlyAmountMax === null) return null;
  const minimum = item.monthlyAmountMin ?? item.monthlyAmountMax ?? 0;
  const maximum = item.monthlyAmountMax ?? item.monthlyAmountMin ?? minimum;
  return (minimum + maximum) / 2;
}

function listingSimilarity(
  candidate: Omit<VisitOutcomeHistoryItem, "outcome">,
  history: VisitOutcomeHistoryItem,
) {
  const locality =
    normalizedText(candidate.locality) === normalizedText(history.locality) ? 1 : 0;
  const category = candidate.category === history.category ? 1 : 0;
  const candidateAmount = amountMidpoint(candidate);
  const historyAmount = amountMidpoint(history);
  const budget =
    candidateAmount === null || historyAmount === null
      ? null
      : Math.max(
          0,
          1 - Math.abs(candidateAmount - historyAmount) / Math.max(historyAmount, 1),
        );
  const comparedWeight = 0.55 + 0.2 + (budget === null ? 0 : 0.25);
  return (locality * 0.55 + category * 0.2 + (budget ?? 0) * 0.25) / comparedWeight;
}

export function listingVisitOutcomeAlignment(
  candidate: Omit<VisitOutcomeHistoryItem, "outcome">,
  history: VisitOutcomeHistoryItem[] | undefined,
) {
  const usefulHistory = (history ?? []).filter(
    (item) => item.outcome !== "NO_SHOW",
  );
  if (!usefulHistory.length) return null;

  let weightedAlignment = 0;
  let totalWeight = 0;
  for (const item of usefulHistory.slice(0, 30)) {
    const similarity = listingSimilarity(candidate, item);
    const weight =
      item.outcome === "FINALIZED"
        ? 1
        : item.outcome === "INTERESTED"
          ? 0.75
          : 0.65;
    const alignment = item.outcome === "NOT_SUITABLE" ? 1 - similarity : similarity;
    weightedAlignment += alignment * weight;
    totalWeight += weight;
  }

  return totalWeight ? weightedAlignment / totalWeight : null;
}

export function personVisitOutcomeAlignment(outcome: VisitOutcomeType | null) {
  if (outcome === "FINALIZED") return 1;
  if (outcome === "INTERESTED") return 0.8;
  if (outcome === "NOT_SUITABLE") return 0.15;
  return null;
}
