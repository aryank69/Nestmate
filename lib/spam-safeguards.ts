type SafetyRestrictionError = {
  code?: string | null;
};

export type SafetyRestrictionScope =
  | "post"
  | "direct-message"
  | "community-message";

const restrictionMessages: Record<SafetyRestrictionScope, string> = {
  post: "Posting is temporarily limited because we detected unusual activity. Please wait a little before trying again.",
  "direct-message":
    "Messaging is temporarily limited because we detected unusual activity. Please wait a little before trying again.",
  "community-message":
    "Community messaging is temporarily limited because we detected unusual activity. Please wait a little before trying again.",
};

export function isSafetyRestrictionError(
  error: SafetyRestrictionError | null | undefined,
) {
  return error?.code === "42501";
}

export function getSafetyRestrictionMessage(scope: SafetyRestrictionScope) {
  return restrictionMessages[scope];
}
