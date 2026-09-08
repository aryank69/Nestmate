"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChartColumnIncreasing,
  Minus,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  formatHouseholdAmount,
  HOUSEHOLD_BUDGET_CATEGORIES,
} from "@/lib/household";
import { cn } from "@/lib/utils";
import type {
  HouseholdExpenseCategoryChange,
  HouseholdExpenseTrends,
  HouseholdTrendDirection,
} from "@/types/household";

function shortMonth(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

function categoryLabel(value: HouseholdExpenseCategoryChange["category"]) {
  return HOUSEHOLD_BUDGET_CATEGORIES.find(({ value: key }) => key === value)?.label ?? value;
}

function Direction({
  direction,
  changePercent,
  compact = false,
}: {
  direction: HouseholdTrendDirection;
  changePercent: number | null;
  compact?: boolean;
}) {
  if (direction === "START") {
    return <span className="text-muted-foreground">Starting month</span>;
  }
  if (direction === "NEW") {
    return <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Sparkles aria-hidden="true" className="size-3" />New spend</span>;
  }
  if (direction === "FLAT") {
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus aria-hidden="true" className="size-3" />No change</span>;
  }
  const increased = direction === "UP";
  const Icon = increased ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-semibold",
      increased ? "text-rose-700" : "text-emerald-700",
    )}>
      <Icon aria-hidden="true" className="size-3" />
      {changePercent === null
        ? increased ? "Increased" : "Decreased"
        : `${Math.abs(changePercent)}%${compact ? "" : increased ? " increase" : " decrease"}`}
    </span>
  );
}

export function ExpenseTrends({
  trends,
}: {
  trends: HouseholdExpenseTrends | null;
}) {
  const [range, setRange] = useState<6 | 12>(6);
  const months = useMemo(
    () => trends?.months.slice(-range) ?? [],
    [range, trends],
  );
  const maximum = Math.max(1, ...months.map(({ totalMinor }) => totalMinor));
  const latest = months.at(-1);
  const visibleCategories = trends?.categoryChanges.filter(
    ({ currentMinor, previousMinor }) => currentMinor > 0 || previousMinor > 0,
  ) ?? [];

  return (
    <section className="mb-5 rounded-2xl border border-border/75 bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <ChartColumnIncreasing aria-hidden="true" className="size-4 text-primary" />
            Expense trends
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Household-level spending patterns only—no member payment details.
          </p>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border bg-muted/25 p-1" aria-label="Trend range">
          {([
            { value: 6, label: "6 months" },
            { value: 12, label: "12 months" },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                range === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!trends ? (
        <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This private trend summary is temporarily unavailable.
        </div>
      ) : !months.some(({ expenseCount }) => expenseCount > 0) ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-5 py-7 text-center">
          <ChartColumnIncreasing aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Not enough spending history yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Monthly trends will appear as shared expenses are added.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-border/65 bg-muted/10 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Latest month</p>
                <p className="mt-1 text-xl font-bold tracking-tight">{formatHouseholdAmount(latest?.totalMinor ?? 0)}</p>
              </div>
              {latest ? <p className="text-xs"><Direction direction={latest.direction} changePercent={latest.changePercent} /></p> : null}
            </div>

            <div className={cn("mt-5 grid h-36 grid-cols-6 items-end gap-1.5 sm:gap-2", range === 12 && "sm:grid-cols-12")} aria-label={`${range}-month household spending chart`}>
              {months.map((month) => {
                const height = month.totalMinor === 0 ? 3 : Math.max(8, Math.round(month.totalMinor * 100 / maximum));
                return (
                  <div key={month.month} className={cn("flex h-full min-w-0 flex-col justify-end", range === 12 && "odd:hidden sm:odd:flex")}>
                    <div className="group relative flex flex-1 items-end">
                      <div
                        className="w-full rounded-t-lg bg-primary/75 transition-colors hover:bg-primary"
                        style={{ height: `${height}%` }}
                        title={`${shortMonth(month.month)}: ${formatHouseholdAmount(month.totalMinor)}`}
                      />
                    </div>
                    <span className="mt-2 truncate text-center text-[0.625rem] font-medium text-muted-foreground">{shortMonth(month.month)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/65 p-4">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Repeat2 aria-hidden="true" className="size-4 text-primary" /> Latest month mix
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/25 p-3">
                  <p className="text-sm font-bold">{formatHouseholdAmount(latest?.recurringMinor ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Recurring bills</p>
                </div>
                <div className="rounded-xl bg-muted/25 p-3">
                  <p className="text-sm font-bold">{formatHouseholdAmount(latest?.oneTimeMinor ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">One-time expenses</p>
                </div>
              </div>
              {latest?.budgetMinor ? (
                <div className="mt-3">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Recorded budget usage</span>
                    <span className="font-semibold">{latest.budgetUsagePercent}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", (latest.budgetUsagePercent ?? 0) >= 100 ? "bg-rose-500" : (latest.budgetUsagePercent ?? 0) >= 80 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(100, latest.budgetUsagePercent ?? 0)}%` }} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/65 p-4">
              <p className="text-xs font-bold">Category changes from last month</p>
              {visibleCategories.length ? (
                <div className="mt-3 divide-y divide-border/60">
                  {visibleCategories.map((category) => (
                    <div key={category.category} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{categoryLabel(category.category)}</p>
                        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{formatHouseholdAmount(category.currentMinor)} this month</p>
                      </div>
                      <p className="shrink-0 text-[0.6875rem]"><Direction compact direction={category.direction} changePercent={category.changePercent} /></p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No category spending in either month.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
