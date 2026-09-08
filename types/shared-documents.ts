import type { InterestTargetType } from "@/types/activity";

export type SharedDocumentCategory =
  | "ID_PROOF"
  | "AGREEMENT_DRAFT"
  | "DEPOSIT_RECEIPT"
  | "INVENTORY_SHEET"
  | "MOVE_IN_DOCUMENT";

export type DocumentAcknowledgementStatus = "REVIEWED" | "ACKNOWLEDGED";

export type FinalizedMilestoneKind =
  | "AGREEMENT_DRAFTED"
  | "AGREEMENT_REVIEWED"
  | "AGREEMENT_ACKNOWLEDGED"
  | "DEPOSIT_CONFIRMED"
  | "DOCUMENTS_EXCHANGED"
  | "INVENTORY_COMPLETED"
  | "KEYS_HANDED_OVER"
  | "MOVE_IN_COMPLETED";

export type FinalizedMilestoneStatus = "PENDING" | "COMPLETED";
export type FinalizedMatchStatus = "ACTIVE" | "COMPLETED" | "CLOSED";
export type MatchClosureReason =
  | "MOVE_IN_COMPLETED"
  | "MOVE_IN_CANCELLED"
  | "CREATED_BY_MISTAKE"
  | "ARCHIVED";

export type FinalizedMatchStatusChangeView = {
  id: string;
  fromStatus: FinalizedMatchStatus;
  toStatus: FinalizedMatchStatus;
  reason: MatchClosureReason | null;
  actorName: string;
  createdAt: string;
};

export type FinalizedVisitHistoryView = {
  id: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
};

export type FinalizedMatchMilestoneView = {
  id: string;
  spaceId: string;
  userId: string;
  kind: FinalizedMilestoneKind;
  status: FinalizedMilestoneStatus;
  completedAt: string | null;
  updatedAt: string;
};

export type SharedDocumentAcknowledgementView = {
  userId: string;
  status: DocumentAcknowledgementStatus;
  updatedAt: string;
};

export type SharedDocumentView = {
  id: string;
  spaceId: string;
  uploaderId: string;
  seriesId: string;
  versionNumber: number;
  isCurrent: boolean;
  replacesDocumentId: string | null;
  category: SharedDocumentCategory;
  objectPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  revokedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  acknowledgements: SharedDocumentAcknowledgementView[];
};

export type FinalizedDocumentSpaceView = {
  id: string;
  targetType: InterestTargetType;
  title: string;
  subtitle: string;
  counterpartName: string;
  status: FinalizedMatchStatus;
  statusBeforeClose: FinalizedMatchStatus | null;
  closureReason: MatchClosureReason | null;
  completedAt: string | null;
  closedAt: string | null;
  canReopen: boolean;
  documents: SharedDocumentView[];
  milestones: FinalizedMatchMilestoneView[];
  visits: FinalizedVisitHistoryView[];
  statusChanges: FinalizedMatchStatusChangeView[];
};

export type SharedDocumentsPageData = {
  viewerId: string;
  spaces: FinalizedDocumentSpaceView[];
};

export type SharedDocumentActionState = {
  success: boolean;
  message: string;
};
