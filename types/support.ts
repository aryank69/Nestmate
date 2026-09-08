export type SupportCaseCategory =
  | "GENERAL_SUPPORT"
  | "ACCOUNT_ACCESS"
  | "CONTENT_APPEAL"
  | "RESTRICTION_APPEAL"
  | "SAFETY_CONCERN"
  | "TECHNICAL_ISSUE";

export type SupportCaseStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "REJECTED";

export type SupportCaseMessage = {
  id: string;
  senderRole: "USER" | "MODERATOR";
  senderName: string;
  body: string;
  createdAt: string;
};

export type SupportCaseSummary = {
  id: string;
  category: SupportCaseCategory;
  subject: string;
  description: string;
  reference: string | null;
  status: SupportCaseStatus;
  lastResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportCaseDetail = SupportCaseSummary & {
  messages: SupportCaseMessage[];
};

export type SupportActionState = {
  success: boolean;
  message: string;
  caseId?: string;
};

export type ManageSupportCaseInput = {
  caseId: string;
  status: SupportCaseStatus;
  response: string;
  internalNote: string;
};

export type ModerationSupportCase = SupportCaseDetail & {
  user: { id: string; name: string; email: string | null };
  internalNotes: Array<{
    id: string;
    body: string;
    moderatorName: string;
    createdAt: string;
  }>;
};
