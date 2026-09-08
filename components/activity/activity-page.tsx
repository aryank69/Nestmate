import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Clock3,
  SlidersHorizontal,
  UserRound,
  Waypoints,
} from "lucide-react";

import { ActivityStageControl } from "@/components/activity/activity-stage-control";
import { buttonVariants } from "@/components/ui/button";
import {
  ACTIVITY_SOURCE_LABELS,
  INTEREST_STAGE_LABELS,
  INTEREST_STAGES,
} from "@/lib/activity";
import { cn } from "@/lib/utils";
import type { ActivityData, ActivityFilters } from "@/types/activity";

function activityTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ActivityPage({
  data,
  filters,
}: {
  data: ActivityData;
  filters: ActivityFilters;
}) {
  return (
    <section className="content-shell py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary">
              <Waypoints aria-hidden="true" className="size-3.5" />
              Private to you
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
              My Activity
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Keep housing leads and potential flatmates organized in one simple
              journey. Chat messages and private visit notes are never shown here.
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Blocked, private, deleted, or unavailable items are automatically hidden.
            </p>
          </div>
          <Link href="/community" className={cn(buttonVariants({ variant: "outline" }))}>
            Explore communities
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </header>

        <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {INTEREST_STAGES.map((stage) => (
            <div key={stage} className="rounded-2xl border border-border/75 bg-card px-3 py-3.5 shadow-sm">
              <p className="text-2xl font-bold tracking-tight">{data.counts[stage]}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {INTEREST_STAGE_LABELS[stage]}
              </p>
            </div>
          ))}
        </div>

        <form className="mt-6 grid gap-3 rounded-2xl border border-border/75 bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
            Stage
            <select
              name="stage"
              defaultValue={filters.stage ?? ""}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            >
              <option value="">All stages</option>
              {INTEREST_STAGES.map((stage) => (
                <option key={stage} value={stage}>{INTEREST_STAGE_LABELS[stage]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
            Type
            <select
              name="type"
              defaultValue={filters.targetType ?? ""}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            >
              <option value="">Listings and flatmates</option>
              <option value="LISTING">Listings</option>
              <option value="FLATMATE">Flatmates</option>
            </select>
          </label>
          <button type="submit" className={cn(buttonVariants(), "h-11 w-full sm:w-auto")}>
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Apply filters
          </button>
        </form>

        {data.error ? (
          <p role="alert" className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {data.error}
          </p>
        ) : null}

        {data.items.length ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {data.items.map((item) => {
              const ItemIcon = item.targetType === "LISTING" ? Building2 : UserRound;
              return (
                <article key={`${item.targetType}:${item.targetId}`} className="surface-card flex flex-col p-5 sm:p-6">
                  <header className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <ItemIcon aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          {INTEREST_STAGE_LABELS[item.stage]}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {item.targetType === "LISTING" ? "Listing" : "Flatmate"}
                        </span>
                      </div>
                      <h2 className="mt-3 text-lg font-semibold leading-6">{item.title}</h2>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">{item.subtitle}</p>
                    </div>
                  </header>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 aria-hidden="true" className="size-3.5" />
                    {ACTIVITY_SOURCE_LABELS[item.source]} · {activityTime(item.occurredAt)}
                  </p>
                  <footer className="mt-auto grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-[1fr_auto_auto]">
                    <ActivityStageControl
                      targetType={item.targetType}
                      targetId={item.targetId}
                      initialStage={item.stage}
                    />
                    <Link href={item.href} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                      View
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    {item.stage === "FINALIZED" && item.moveInChecklistId ? (
                      <Link
                        href={`/move-in/${encodeURIComponent(item.moveInChecklistId)}`}
                        className={cn(buttonVariants(), "w-full")}
                      >
                        <ClipboardCheck aria-hidden="true" className="size-4" />
                        Checklist
                      </Link>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <Waypoints aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No matching activity yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Save a listing, shortlist a flatmate, start a conversation, plan a visit,
              or choose a stage from any eligible card.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
