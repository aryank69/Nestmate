import type {
  ManageSupportCaseInput,
  SupportCaseCategory,
  SupportCaseStatus,
} from "@/types/support";

export const MAX_SUPPORT_SUBJECT_LENGTH = 120;
export const MAX_SUPPORT_DESCRIPTION_LENGTH = 2000;
export const MAX_SUPPORT_REFERENCE_LENGTH = 200;
export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;

export const supportCategoryLabels: Record<SupportCaseCategory, string> = {
  GENERAL_SUPPORT: "General support",
  ACCOUNT_ACCESS: "Account access",
  CONTENT_APPEAL: "Content appeal",
  RESTRICTION_APPEAL: "Account restriction appeal",
  SAFETY_CONCERN: "Safety concern",
  TECHNICAL_ISSUE: "Technical issue",
};

export const supportStatusLabels: Record<SupportCaseStatus, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

export const supportCategories = Object.keys(
  supportCategoryLabels,
) as SupportCaseCategory[];
export const supportStatuses = Object.keys(
  supportStatusLabels,
) as SupportCaseStatus[];

export function validateSupportCaseInput(input: {
  category: string;
  subject: string;
  description: string;
  reference?: string;
}) {
  const category = input.category.trim() as SupportCaseCategory;
  const subject = input.subject.trim();
  const description = input.description.trim();
  const reference = input.reference?.trim() || null;

  if (!supportCategories.includes(category)) {
    return { success: false as const, message: "Choose a support category." };
  }
  if (subject.length < 5 || subject.length > MAX_SUPPORT_SUBJECT_LENGTH) {
    return {
      success: false as const,
      message: "Add a subject between 5 and 120 characters.",
    };
  }
  if (
    description.length < 20 ||
    description.length > MAX_SUPPORT_DESCRIPTION_LENGTH
  ) {
    return {
      success: false as const,
      message: "Describe what happened in 20 to 2,000 characters.",
    };
  }
  if (reference && reference.length > MAX_SUPPORT_REFERENCE_LENGTH) {
    return {
      success: false as const,
      message: "Keep the optional reference within 200 characters.",
    };
  }

  return {
    success: true as const,
    data: { category, subject, description, reference },
  };
}

export function cleanSupportMessage(value: string) {
  const body = typeof value === "string" ? value.trim() : "";
  return body.length > 0 && body.length <= MAX_SUPPORT_MESSAGE_LENGTH
    ? body
    : null;
}

export function validateManageSupportCaseInput(input: ManageSupportCaseInput) {
  const caseId = input.caseId.trim();
  const response = input.response.trim();
  const internalNote = input.internalNote.trim();

  if (!/^[0-9a-f-]{36}$/i.test(caseId)) {
    return { success: false as const, message: "Choose a valid support case." };
  }
  if (!supportStatuses.includes(input.status)) {
    return { success: false as const, message: "Choose a valid case status." };
  }
  if (response.length > MAX_SUPPORT_MESSAGE_LENGTH) {
    return { success: false as const, message: "Keep the response within 2,000 characters." };
  }
  if (internalNote.length > MAX_SUPPORT_MESSAGE_LENGTH) {
    return { success: false as const, message: "Keep the internal note within 2,000 characters." };
  }
  return {
    success: true as const,
    data: { caseId, status: input.status, response, internalNote },
  };
}

export function formatSupportTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
