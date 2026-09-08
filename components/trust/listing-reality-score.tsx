import { ScanSearch, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ListingRealityScore } from "@/types/listing-reality";

export function ListingRealityScoreIndicator({
  value,
  details = false,
  className,
}: {
  value: ListingRealityScore;
  details?: boolean;
  className?: string;
}) {
  if (value.score === null) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-xs font-semibold text-muted-foreground", className)}>
        <ScanSearch aria-hidden="true" className="size-3.5" />
        Not enough verified feedback
      </div>
    );
  }

  return (
    <div className={cn(details ? "rounded-2xl border border-emerald-200/75 bg-emerald-50/45 p-4" : "inline-flex", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          Listing Reality {value.score}/100
        </span>
        {details ? (
          <span className="text-xs font-medium text-emerald-900/75">
            {value.label} · {value.responseCount} verified visits
          </span>
        ) : null}
      </div>

      {details ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {value.categories.map((category) => (
              <div key={category.key} className="rounded-xl border border-emerald-200/65 bg-background p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">{category.label}</span>
                  <span className="text-muted-foreground">{category.score}/100</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${category.score}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{category.indicator}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Based only on confirmed visits. Individual reviewers, ratings, and private notes are never shown.
          </p>
        </>
      ) : null}
    </div>
  );
}
