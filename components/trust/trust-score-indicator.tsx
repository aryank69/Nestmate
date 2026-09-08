import { ShieldCheck, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TrustScore } from "@/types/trust";

export function TrustScoreIndicator({
  value,
  scope = "profile",
  details = false,
  className,
}: {
  value: TrustScore;
  scope?: "profile" | "listing";
  details?: boolean;
  className?: string;
}) {
  const established = value.confidence === "established";
  const Icon = established ? ShieldCheck : ShieldQuestion;
  const subject = scope === "listing" ? "listing" : "member";

  return (
    <section
      aria-label={`${scope === "listing" ? "Listing" : "Profile"} trust score`}
      className={cn(
        details
          ? "rounded-2xl border border-border/75 bg-muted/30 p-4"
          : "inline-flex max-w-full flex-wrap items-center gap-1.5 text-xs",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold",
          established
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        Trust {value.score}/100
      </span>
      {!details ? (
        <span className="truncate text-muted-foreground">
          {value.reasons[0] ?? value.label}
        </span>
      ) : (
        <div className="mt-3 w-full">
          <p className="text-sm font-semibold text-foreground">{value.label}</p>
          {value.reasons.length ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Trust reasons">
              {value.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                >
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              This {subject} is still building enough history for a meaningful score.
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Deterministic signal, not a guarantee. Private feedback, report details,
            moderation notes, and anti-spam rules are never shown.
          </p>
        </div>
      )}
    </section>
  );
}
