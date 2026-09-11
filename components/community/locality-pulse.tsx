import type { LucideIcon } from "lucide-react";
import {
  CalendarRange,
  Clock3,
  Home,
  IndianRupee,
  Route,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import type {
  LocalityPulse,
  LocalityPulseMetric,
} from "@/types/locality-pulse";

const pulseItems: Array<{
  key: keyof Omit<LocalityPulse, "minimumSampleSize">;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "activeListings", label: "Active listings", icon: Home },
  { key: "peopleSearching", label: "People searching", icon: UsersRound },
  { key: "medianRent", label: "Median rent", icon: IndianRupee },
  { key: "typicalDeposit", label: "Typical deposit", icon: ShieldCheck },
  { key: "listingFreshness", label: "Listing freshness", icon: Clock3 },
  { key: "supplyDemandTrend", label: "30-day trend", icon: TrendingUp },
  { key: "popularMoveInPeriod", label: "Popular move-in", icon: CalendarRange },
  { key: "commutePattern", label: "Commute pattern", icon: Route },
];

export function LocalityPulseCard({
  locality,
  pulse,
}: {
  locality: string;
  pulse: LocalityPulse;
}) {
  return (
    <section
      aria-labelledby="locality-pulse-heading"
      className="overflow-hidden rounded-3xl border border-border/75 bg-card shadow-sm"
    >
      <div className="border-b border-border/70 bg-muted/35 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Renter snapshot
            </p>
            <h2
              id="locality-pulse-heading"
              className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] text-foreground"
            >
              {locality} Locality Pulse
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              A quick, privacy-safe view of housing activity based on eligible
              Roomzi posts and broad search preferences.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
            Minimum {pulse.minimumSampleSize} records
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-border/65 sm:grid-cols-4">
        {pulseItems.map(({ key, label, icon: Icon }) => (
          <PulseMetricCard
            key={key}
            label={label}
            metric={pulse[key]}
            icon={Icon}
          />
        ))}
      </div>

      <p className="border-t border-border/70 px-5 py-3.5 text-xs leading-5 text-muted-foreground sm:px-7">
        Metrics are hidden when the minimum sample is not met. Rent and deposit
        are rounded, dates use broad windows, and private destinations,
        coordinates, identities, and individual records are never shown.
      </p>
    </section>
  );
}

function PulseMetricCard({
  label,
  metric,
  icon: Icon,
}: {
  label: string;
  metric: LocalityPulseMetric<string | number>;
  icon: LucideIcon;
}) {
  const available = metric.status === "AVAILABLE";

  return (
    <article className="min-w-0 px-4 py-5 sm:px-5 sm:py-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {label}
      </div>
      <p
        className={`mt-3 text-base font-semibold leading-6 tracking-[-0.02em] sm:text-lg ${
          available ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {available ? metric.value : "Not enough data"}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {metric.detail}
      </p>
    </article>
  );
}
