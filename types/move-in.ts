import type { InterestTargetType } from "@/types/activity";

export type MoveInChecklistItemKind =
  | "DEPOSIT_CONFIRMATION"
  | "RENT_AMOUNT"
  | "MOVE_IN_DATE"
  | "ID_DOCUMENT_EXCHANGE"
  | "AGREEMENT_STATUS"
  | "INVENTORY_PHOTOS"
  | "UTILITY_RESPONSIBILITIES"
  | "KEYS"
  | "EMERGENCY_CONTACT_DETAILS";

export type MoveInChecklistItemView = {
  id: string;
  kind: MoveInChecklistItemKind;
  label: string;
  privateDetail: string;
  isCompleted: boolean;
  completedAt: string | null;
};

export type MoveInChecklistView = {
  id: string;
  targetType: InterestTargetType;
  title: string;
  subtitle: string;
  counterpartName: string;
  isReadOnly: boolean;
  completedCount: number;
  totalCount: number;
  items: MoveInChecklistItemView[];
};

export type MoveInChecklistActionState = {
  success: boolean;
  message: string;
};
