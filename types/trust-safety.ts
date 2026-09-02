export type ReportTargetType =
  | "USER"
  | "POST"
  | "DIRECT_MESSAGE"
  | "COMMUNITY_MESSAGE";

export type ReportReason =
  | "SPAM"
  | "SCAM"
  | "HARASSMENT"
  | "INAPPROPRIATE_CONTENT"
  | "IMPERSONATION"
  | "SAFETY_CONCERN"
  | "OTHER";

export type ReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
};

export type TrustSafetyActionState = {
  success: boolean;
  message: string;
};
