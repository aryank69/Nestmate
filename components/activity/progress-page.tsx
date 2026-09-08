import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  CircleOff,
  Clock3,
  ContactRound,
  HeartHandshake,
  Layers3,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  ACTIVITY_SOURCE_LABELS,
  INTEREST_STAGE_LABELS,
} from "@/lib/activity";
import { cn } from "@/lib/utils";
import type {
  ActivityItem,
  ProgressMetrics,
} from "@/types/activity";

const metricDefinitions = [
  { key: "activeOptions", label: "Active options", icon: Layers3, tone: "bg-primary/10 text-primary" },
  { key: "contacted", label: "Contacted", icon: ContactRound, tone: "bg-blue-50 text-blue-700" },
  { key: "visitsPlanned", label: "Visits planned", icon: CalendarClock, tone: "bg-amber-50 text-amber-700" },
  { key: "visitsCompleted", label: "Visits completed", icon: CalendarCheck2, tone: "bg-violet-50 text-violet-700" },
  { key: "shortlisted", label: "Shortlisted", icon: HeartHandshake, tone: "bg-pink-50 text-pink-700" },
  { key: "finalized", label: "Finalized", icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-700" },
  { key: "dropped", label: "Dropped", icon: CircleOff, tone: "bg-muted text-muted-foreground" },
] as const satisfies ReadonlyArray<{
  key: keyof ProgressMetrics;
  label: string;
  icon: typeof Layers3;
  tone: string;
}>;

function formatTimelineTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function timelineAction(item: ActivityItem) {
  if (item.source === "SAVED") {
    return item.targetType === "LISTING" ? "Listing saved" : "Flatmate shortlisted";
  }
  if (item.source === "CHAT") return "Flatmate contacted";
  if (item.source === "VISIT") {
    return item.stage === "VISIT_PLANNED"
      ? "Visit planned"
      : "Visit progress updated";
  }
  return `Marked ${INTEREST_STAGE_LABELS[item.stage].toLowerCase()}`;
}

export function ProgressPage({
  metrics,
  timeline,
  error,
}: {
  metrics: ProgressMetrics;
  timeline: ActivityItem[];
  error: string;
}) {
  return (
    <section className="content-shell py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary">
              <ChartNoAxesColumnIncreasing aria-hidden="true" className="size-3.5" />
              Your private progress
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
              Your search at a glance
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              A lightweight summary of your visible listings, flatmates, conversations,
              and visits—only for you.
            </p>
          </div>
          <Link href="/activity" className={cn(buttonVariants({ variant: "outline" }))}>
            Manage activity
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </header>

        {error ? (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {metricDefinitions.map((metric) => {
            const MetricIcon = metric.icon;
            return (
              <article key={metric.key} className="rounded-2xl border border-border/75 bg-card p-4 shadow-sm">
                <span className={cn("flex size-9 items-center justify-center rounded-xl", metric.tone)}>
                  <MetricIcon aria-hidden="true" className="size-4.5" />
                </span>
                <p className="mt-4 text-3xl font-bold tracking-[-0.04em]">{metrics[metric.key]}</p>
                <p className="mt-1 text-xs font-semibold leading-4 text-muted-foreground">{metric.label}</p>
              </article>
            );
          })}
        </div>

        <section className="mt-7 overflow-hidden rounded-3xl border border-border/75 bg-card shadow-sm">
          <header className="border-b border-border/70 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The latest safe milestones from your housing search.
            </p>
          </header>

          {timeline.length ? (
            <ol className="divide-y divide-border/70 px-5 sm:px-6">
              {timeline.map((item, index) => (
                <li key={`${item.targetType}:${item.targetId}:${item.source}:${item.stage}:${item.occurredAt}`} className="relative flex gap-3 py-4">
                  <div className="relative flex shrink-0 flex-col items-center">
                    <span className="mt-1 size-3 rounded-full border-2 border-primary bg-background" />
                    {index < timeline.length - 1 ? (
                      <span aria-hidden="true" className="absolute top-4 h-[calc(100%+1rem)] w-px bg-border" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{timelineAction(item)}</p>
                      <Link href={item.href} className="mt-0.5 block truncate text-sm text-muted-foreground transition-colors hover:text-primary">
                        {item.title} · {item.targetType === "LISTING" ? "Listing" : "Flatmate"}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ACTIVITY_SOURCE_LABELS[item.source]}
                      </p>
                    </div>
                    <p className="mt-2 flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground sm:mt-0">
                      <Clock3 aria-hidden="true" className="size-3.5" />
                      {formatTimelineTime(item.occurredAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="px-6 py-12 text-center">
              <ChartNoAxesColumnIncreasing aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Your progress will appear here</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Save a listing, shortlist a flatmate, start a conversation, or plan a visit.
              </p>
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          Blocked, private, deleted, suspended, and unavailable items are excluded.
          Message contents, private notes, and exact private locations are never included.
        </p>
      </div>
    </section>
  );
}
