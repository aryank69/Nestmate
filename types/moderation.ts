export type ModeratorRole = "ADMIN" | "MODERATOR";

export type ModerationQueueType =
  | "REPORT"
  | "SAFETY_FLAG"
  | "VERIFICATION_CHECK"
  | "USER_STATE"
  | "SUPPORT_CASE";

export type ModerationActionType =
  | "DISMISS"
  | "WARN"
  | "HIDE_CONTENT"
  | "RESTRICT"
  | "SUSPEND"
  | "RESTORE_USER"
  | "SUPPORT_CASE_UPDATE";

export type ModerationQueueItem = {
  queueType: Exclude<ModerationQueueType, "USER_STATE" | "SUPPORT_CASE">;
  id: string;
  createdAt: string;
  sourceLabel: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  headline: string;
  reason: string;
  reporterName: string | null;
  subject: {
    id: string;
    name: string;
    email: string | null;
  };
  target: {
    type: string;
    id: string;
    label: string;
    excerpt: string | null;
    href: string | null;
    canHide: boolean;
    hidden: boolean;
  };
  internalDetails: string[];
};

export type ModerationRestriction = {
  userId: string;
  userName: string;
  email: string | null;
  status: "RESTRICTED" | "SUSPENDED";
  restrictedUntil: string | null;
  privateReason: string;
  updatedBy: string;
  updatedAt: string;
};

export type ModerationAuditEntry = {
  id: string;
  action: ModerationActionType;
  moderatorName: string;
  subjectName: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
};

export type ModerationDashboardData = {
  role: ModeratorRole;
  queue: ModerationQueueItem[];
  supportCases: import("@/types/support").ModerationSupportCase[];
  restrictions: ModerationRestriction[];
  audit: ModerationAuditEntry[];
};

export type ModerationActionInput = {
  queueType: ModerationQueueType;
  queueId: string;
  action: ModerationActionType;
  reason: string;
  restrictionHours?: number | null;
};

export type ModerationActionState = {
  success: boolean;
  message: string;
};
