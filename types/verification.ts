export type VerificationKind =
  | "EMAIL"
  | "PHONE"
  | "PROFILE_COMPLETE"
  | "LISTING_DETAILS"
  | "IDENTITY"
  | "PROPERTY";

export type VerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

export type VerificationCheckSummary = {
  kind: VerificationKind;
  status: VerificationStatus;
  verifiedAt: Date | string | null;
  expiresAt: Date | string | null;
};

export type TrustBadge = {
  kind: VerificationKind;
  label: string;
  description: string;
  strength: "basic" | "enhanced";
};

export type VerificationSummary = {
  badges: TrustBadge[];
};
