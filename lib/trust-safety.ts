import type {
  ReportInput,
  ReportReason,
  ReportTargetType,
} from "@/types/trust-safety";

export const MAX_REPORT_DETAILS_LENGTH = 500;
export const MAX_REPORT_TARGET_ID_LENGTH = 128;

export const reportReasonOptions: ReadonlyArray<{
  value: ReportReason;
  label: string;
}> = [
  { value: "SPAM", label: "Spam" },
  { value: "SCAM", label: "Scam or fraud" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "SAFETY_CONCERN", label: "Safety concern" },
  { value: "OTHER", label: "Other" },
];

const reportTargetTypes = new Set<ReportTargetType>([
  "USER",
  "POST",
  "DIRECT_MESSAGE",
  "COMMUNITY_MESSAGE",
]);
const reportReasons = new Set(reportReasonOptions.map(({ value }) => value));

export function cleanReportDetails(value?: string) {
  const cleaned = value?.trim() ?? "";
  return cleaned ? cleaned.slice(0, MAX_REPORT_DETAILS_LENGTH) : null;
}

export function validateReportInput(input: ReportInput) {
  const targetId = input.targetId.trim();

  if (
    !reportTargetTypes.has(input.targetType) ||
    !targetId ||
    targetId.length > MAX_REPORT_TARGET_ID_LENGTH
  ) {
    return { success: false as const, message: "Choose valid content to report." };
  }

  if (!reportReasons.has(input.reason)) {
    return { success: false as const, message: "Choose a reason for the report." };
  }

  return {
    success: true as const,
    data: {
      targetType: input.targetType,
      targetId,
      reason: input.reason,
      details: cleanReportDetails(input.details),
    },
  };
}

export function isValidNestMateUserId(value: string) {
  const cleaned = value.trim();
  return cleaned.length > 0 && cleaned.length <= 128;
}
