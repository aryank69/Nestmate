import type {
  ModerationActionInput,
  ModerationActionType,
  ModerationQueueType,
} from "@/types/moderation";

export const MAX_MODERATION_REASON_LENGTH = 500;

const queueTypes = new Set<ModerationQueueType>([
  "REPORT",
  "SAFETY_FLAG",
  "VERIFICATION_CHECK",
  "USER_STATE",
  "SUPPORT_CASE",
]);
const actionTypes = new Set<ModerationActionType>([
  "DISMISS",
  "WARN",
  "HIDE_CONTENT",
  "RESTRICT",
  "SUSPEND",
  "RESTORE_USER",
  "SUPPORT_CASE_UPDATE",
]);

export const moderationActionLabels: Record<ModerationActionType, string> = {
  DISMISS: "Dismiss",
  WARN: "Warn user",
  HIDE_CONTENT: "Hide content",
  RESTRICT: "Temporarily restrict",
  SUSPEND: "Suspend account",
  RESTORE_USER: "Restore account",
  SUPPORT_CASE_UPDATE: "Update support case",
};

export function validateModerationActionInput(
  input: ModerationActionInput,
):
  | { success: true; data: Required<ModerationActionInput> }
  | { success: false; message: string } {
  const queueId = typeof input.queueId === "string" ? input.queueId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!queueTypes.has(input.queueType) || !actionTypes.has(input.action)) {
    return { success: false, message: "Choose a valid moderation action." };
  }
  if (!queueId || queueId.length > 128) {
    return { success: false, message: "Choose a valid moderation item." };
  }
  if (reason.length < 5 || reason.length > MAX_MODERATION_REASON_LENGTH) {
    return {
      success: false,
      message: "Add a private reason between 5 and 500 characters.",
    };
  }
  if (input.action === "RESTORE_USER" && input.queueType !== "USER_STATE") {
    return { success: false, message: "Choose an active account restriction." };
  }
  if (input.queueType === "USER_STATE" && input.action !== "RESTORE_USER") {
    return { success: false, message: "Only account restoration is available here." };
  }
  if (
    input.queueType === "SUPPORT_CASE" ||
    input.action === "SUPPORT_CASE_UPDATE"
  ) {
    return { success: false, message: "Use the support case controls for this update." };
  }

  const restrictionHours = Number(input.restrictionHours ?? 24);
  if (
    input.action === "RESTRICT" &&
    (!Number.isInteger(restrictionHours) ||
      restrictionHours < 1 ||
      restrictionHours > 168)
  ) {
    return {
      success: false,
      message: "Choose a restriction between 1 and 168 hours.",
    };
  }

  return {
    success: true,
    data: {
      queueType: input.queueType,
      queueId,
      action: input.action,
      reason,
      restrictionHours:
        input.action === "RESTRICT" ? restrictionHours : null,
    },
  };
}

export function formatModerationTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
