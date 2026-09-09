import {
  Activity,
  CircleAlert,
  CircleHelp,
  Gauge,
  House,
  MapPinned,
  Sparkles,
} from "lucide-react";

import { buildListingDecision } from "@/lib/listing-decision";
import { cn } from "@/lib/utils";
import type { ListingRealityScore } from "@/types/listing-reality";
import type { LocalityPulse } from "@/types/locality-pulse";
import type { MoveInReadiness } from "@/types/move-in-readiness";
import type { RecommendationResult } from "@/types/recommendation";

const signalIcons = {
  livingFit: Sparkles,
  reality: House,
  readiness: Gauge,
  localityPulse: MapPinned,
} as const;

const statusStyles = {
  positive: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
  neutral: "border-border bg-background text-foreground",
  caution: "border-orange-200 bg-orange-50/70 text-orange-900",
  missing: "border-dashed border-border bg-muted/35 text-muted-foreground",
} as const;

const labelStyles = {
  "Strong Match": "bg-emerald-600 text-white",
  "Worth Considering": "bg-primary text-primary-foreground",
  "Low Priority": "bg-orange-100 text-orange-900",
} as const;

export function ListingDecisionPanel({
  livingFit,
  reality,
  readiness,
  localityPulse,
  locality,
  compact = false,
  className,
}: {
  livingFit: RecommendationResult | null;
  reality: ListingRealityScore;
  readiness: MoveInReadiness;
  localityPulse: LocalityPulse | null;
  locality: string;
  compact?: boolean;
  className?: string;
}) {
  const decision = buildListingDecision({
    livingFit,
    reality,
    readiness,
    localityPulse,
    locality,
  });

  return (
    <aside
      aria-label="Should I consider this?"
      className={cn(
        "rounded-2xl border border-primary/15 bg-primary/[0.035] p-4",
        !compact && "sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <Activity aria-hidden="true" className="size-4 text-primary" />
            Should I consider this?
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {decision.explanation}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold", labelStyles[decision.label])}>
          {decision.label}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {decision.signals.map((signal) => {
          const Icon = signalIcons[signal.key];
          const StateIcon = signal.status === "caution"
            ? CircleAlert
            : signal.status === "missing"
              ? CircleHelp
              : null;
          return (
            <section
              key={signal.key}
              className={cn("min-w-0 rounded-xl border px-3 py-3", statusStyles[signal.status])}
            >
              <div className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] opacity-80">
                <Icon aria-hidden="true" className="size-3.5" />
                {signal.label}
                {StateIcon ? <StateIcon aria-hidden="true" className="ml-auto size-3.5" /> : null}
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-5">{signal.value}</p>
              <p className={cn("mt-1 text-xs leading-5 opacity-75", compact && "line-clamp-2")}>
                {signal.explanation}
              </p>
            </section>
          );
        })}
      </div>

      <p className="mt-3 text-[0.6875rem] leading-5 text-muted-foreground">
        Signals stay separate and use only information already visible in this listing. Missing data is not treated as a negative, and this label is guidance—not a guarantee.
      </p>
    </aside>
  );
}
