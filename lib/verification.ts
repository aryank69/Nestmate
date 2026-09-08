import type {
  TrustBadge,
  VerificationCheckSummary,
  VerificationKind,
  VerificationSummary,
} from "@/types/verification";

const badgeDefinitions: Record<VerificationKind, TrustBadge> = {
  EMAIL: {
    kind: "EMAIL",
    label: "Email verified",
    description: "The member confirmed access to their email address.",
    strength: "basic",
  },
  PHONE: {
    kind: "PHONE",
    label: "Phone verified",
    description: "The member confirmed access to their phone number.",
    strength: "basic",
  },
  PROFILE_COMPLETE: {
    kind: "PROFILE_COMPLETE",
    label: "Profile complete",
    description: "The member completed NestMate’s core profile and preference fields.",
    strength: "basic",
  },
  LISTING_DETAILS: {
    kind: "LISTING_DETAILS",
    label: "Listing details verified",
    description: "Required structured listing details were completed; the property itself has not been inspected.",
    strength: "basic",
  },
  IDENTITY: {
    kind: "IDENTITY",
    label: "ID verified",
    description: "A stronger identity check was completed.",
    strength: "enhanced",
  },
  PROPERTY: {
    kind: "PROPERTY",
    label: "Property verified",
    description: "A stronger property verification check was completed.",
    strength: "enhanced",
  },
};

function activeVerifiedCheck(check: VerificationCheckSummary, now: Date) {
  if (check.status !== "VERIFIED" || !check.verifiedAt) return false;
  if (!check.expiresAt) return true;
  const expiresAt = new Date(check.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt > now;
}

export function verificationSummary(
  checks: VerificationCheckSummary[],
  now = new Date(),
): VerificationSummary {
  const seen = new Set<VerificationKind>();
  return {
    badges: checks.flatMap((check) => {
      if (!activeVerifiedCheck(check, now) || seen.has(check.kind)) return [];
      seen.add(check.kind);
      return [badgeDefinitions[check.kind]];
    }),
  };
}
