import type {
  FinalizedMatchMilestoneView,
  FinalizedMilestoneKind,
} from "@/types/shared-documents";

export const FINALIZED_MILESTONES = [
  {
    kind: "AGREEMENT_DRAFTED",
    label: "Agreement drafted",
    description: "A draft is ready for independent review.",
  },
  {
    kind: "AGREEMENT_REVIEWED",
    label: "Agreement reviewed",
    description: "The participant has recorded that they reviewed the current draft.",
  },
  {
    kind: "AGREEMENT_ACKNOWLEDGED",
    label: "Agreement acknowledged",
    description: "A coordination marker only—not a signature or acceptance.",
  },
  {
    kind: "DEPOSIT_CONFIRMED",
    label: "Deposit confirmed",
    description: "A private coordination marker—not payment verification.",
  },
  {
    kind: "DOCUMENTS_EXCHANGED",
    label: "Documents exchanged",
    description: "Required move-in documents have been exchanged privately.",
  },
  {
    kind: "INVENTORY_COMPLETED",
    label: "Inventory completed",
    description: "The move-in inventory or condition record is complete.",
  },
  {
    kind: "KEYS_HANDED_OVER",
    label: "Keys handed over",
    description: "Key handover has been recorded by this participant.",
  },
  {
    kind: "MOVE_IN_COMPLETED",
    label: "Move-in completed",
    description: "The participant has marked the move-in as complete.",
  },
] as const satisfies ReadonlyArray<{
  kind: FinalizedMilestoneKind;
  label: string;
  description: string;
}>;

export function isFinalizedMilestoneKind(
  value: unknown,
): value is FinalizedMilestoneKind {
  return FINALIZED_MILESTONES.some(({ kind }) => kind === value);
}

export function milestonesByKind(milestones: FinalizedMatchMilestoneView[]) {
  const grouped = new Map<
    FinalizedMilestoneKind,
    FinalizedMatchMilestoneView[]
  >();
  for (const milestone of milestones) {
    const current = grouped.get(milestone.kind) ?? [];
    current.push(milestone);
    grouped.set(milestone.kind, current);
  }
  return grouped;
}

export function milestoneProgress(
  milestones: FinalizedMatchMilestoneView[],
  userId: string,
) {
  const participantMilestones = milestones.filter(
    (milestone) => milestone.userId === userId,
  );
  return {
    completed: participantMilestones.filter(
      ({ status }) => status === "COMPLETED",
    ).length,
    total: FINALIZED_MILESTONES.length,
  };
}
