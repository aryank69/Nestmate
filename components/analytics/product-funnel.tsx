import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  LockKeyhole,
  UserPlus,
} from "lucide-react";

import type { ProductAnalyticsFunnel } from "@/types/analytics";

export function ProductFunnel({ data }: { data: ProductAnalyticsFunnel }) {
  return (
    <section
      aria-labelledby="product-funnel-heading"
      className="mb-8 rounded-[1.75rem] border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <BarChart3 aria-hidden="true" className="size-4" />
            Private product analytics
          </p>
          <h2
            id="product-funnel-heading"
            className="mt-2 text-xl font-semibold tracking-[-0.03em]"
          >
            Discovery to finalization
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Unique members who reached each stage in the last {data.periodDays} days.
            Only aggregate counts are shown here.
          </p>
        </div>
        <p className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          No content or sensitive profile data
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
          <UserPlus aria-hidden="true" className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">{data.onboarding.signups.toLocaleString("en-IN")} signups</p>
            <p className="text-xs text-muted-foreground">Completed in this period</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
          <BadgeCheck aria-hidden="true" className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {data.onboarding.profilesCompleted.toLocaleString("en-IN")} profiles completed
            </p>
            <p className="text-xs text-muted-foreground">
              {data.onboarding.profileCompletionRate}% of signups in this period
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {data.stages.map((stage, index) => (
          <div key={stage.stage} className="relative rounded-2xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {stage.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {stage.users.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stage.conversionFromPrevious === null
                ? "Unique members"
                : `${stage.conversionFromPrevious}% from previous stage`}
            </p>
            {index < data.stages.length - 1 ? (
              <ArrowRight
                aria-hidden="true"
                className="absolute -right-5 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full border bg-card p-1 text-muted-foreground md:block"
              />
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {data.totalEvents.toLocaleString("en-IN")} allowlisted events contributed
        to this view. Stage counts are distinct-member counts, so repeat actions do
        not inflate conversion.
      </p>
    </section>
  );
}
