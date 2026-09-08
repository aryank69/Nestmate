import {
  BadgeCheck,
  ClipboardCheck,
  IdCard,
  MailCheck,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TrustBadge, VerificationSummary } from "@/types/verification";

const badgeIcons = {
  EMAIL: MailCheck,
  PHONE: PhoneCall,
  PROFILE_COMPLETE: BadgeCheck,
  LISTING_DETAILS: ClipboardCheck,
  IDENTITY: IdCard,
  PROPERTY: ShieldCheck,
} as const;

export function TrustBadges({
  verification,
  compact = false,
  showDisclaimer = false,
  className,
}: {
  verification: VerificationSummary;
  compact?: boolean;
  showDisclaimer?: boolean;
  className?: string;
}) {
  if (!verification.badges.length) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5" aria-label="Trust checks">
        {verification.badges.map((badge) => (
          <TrustBadgePill key={badge.kind} badge={badge} compact={compact} />
        ))}
      </div>
      {showDisclaimer ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Trust badges confirm specific checks only. They are not a guarantee of identity, safety, or property quality.
        </p>
      ) : null}
    </div>
  );
}

function TrustBadgePill({
  badge,
  compact,
}: {
  badge: TrustBadge;
  compact: boolean;
}) {
  const Icon = badgeIcons[badge.kind];
  return (
    <span
      title={badge.description}
      aria-label={`${badge.label}. ${badge.description}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        badge.strength === "enhanced"
          ? "border-primary/25 bg-primary/[0.08] text-primary"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
        compact ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-1 text-xs",
      )}
    >
      <Icon aria-hidden="true" className={compact ? "size-3" : "size-3.5"} />
      {badge.label}
    </span>
  );
}
