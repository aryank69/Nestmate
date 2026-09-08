import type {
  MoveInChecklistItemKind,
  MoveInChecklistItemView,
} from "@/types/move-in";

export const MAX_MOVE_IN_PRIVATE_DETAIL_LENGTH = 500;

export const MOVE_IN_CHECKLIST_TASKS = [
  { kind: "DEPOSIT_CONFIRMATION", label: "Deposit confirmation" },
  { kind: "RENT_AMOUNT", label: "Rent amount" },
  { kind: "MOVE_IN_DATE", label: "Move-in date" },
  { kind: "ID_DOCUMENT_EXCHANGE", label: "ID / document exchange" },
  { kind: "AGREEMENT_STATUS", label: "Agreement status" },
  { kind: "INVENTORY_PHOTOS", label: "Inventory / photos" },
  { kind: "UTILITY_RESPONSIBILITIES", label: "Utility responsibilities" },
  { kind: "KEYS", label: "Keys" },
  { kind: "EMERGENCY_CONTACT_DETAILS", label: "Emergency / contact details" },
] as const satisfies ReadonlyArray<{
  kind: MoveInChecklistItemKind;
  label: string;
}>;

export const MOVE_IN_TASK_GUIDANCE: Record<
  MoveInChecklistItemKind,
  { placeholder: string; inputType: "text" | "number" | "date" }
> = {
  DEPOSIT_CONFIRMATION: {
    placeholder: "Amount and confirmation status",
    inputType: "text",
  },
  RENT_AMOUNT: {
    placeholder: "Agreed monthly rent",
    inputType: "number",
  },
  MOVE_IN_DATE: {
    placeholder: "Choose the agreed date",
    inputType: "date",
  },
  ID_DOCUMENT_EXCHANGE: {
    placeholder: "Status only — never paste ID numbers here",
    inputType: "text",
  },
  AGREEMENT_STATUS: {
    placeholder: "Drafted, reviewed, signed, or not applicable",
    inputType: "text",
  },
  INVENTORY_PHOTOS: {
    placeholder: "Note what was recorded; no uploads in this version",
    inputType: "text",
  },
  UTILITY_RESPONSIBILITIES: {
    placeholder: "Electricity, water, internet, maintenance",
    inputType: "text",
  },
  KEYS: {
    placeholder: "Key handover status",
    inputType: "text",
  },
  EMERGENCY_CONTACT_DETAILS: {
    placeholder: "Private contact handover status",
    inputType: "text",
  },
};

export function cleanMoveInPrivateDetail(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return "";
  return cleaned.slice(0, MAX_MOVE_IN_PRIVATE_DETAIL_LENGTH);
}

export function moveInChecklistProgress(
  items: Array<Pick<MoveInChecklistItemView, "isCompleted">>,
) {
  const totalCount = items.length;
  const completedCount = items.filter(({ isCompleted }) => isCompleted).length;
  return {
    completedCount,
    totalCount,
    percentage: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
  };
}
