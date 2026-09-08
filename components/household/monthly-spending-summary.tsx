"use client";

import {
  CalendarRange,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Gauge,
  LoaderCircle,
  Pencil,
  ReceiptIndianRupee,
  Save,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { setHouseholdMonthlyBudgetAction } from "@/app/household/actions";
import {
  formatHouseholdAmount,
  HOUSEHOLD_BUDGET_CATEGORIES,
  HOUSEHOLD_EXPENSE_CATEGORIES,
} from "@/lib/household";
import type { HouseholdMonthlySpendingSummary } from "@/types/household";
import type { HouseholdBudgetCategory } from "@/types/household";

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

function categoryLabel(value: string) {
  return HOUSEHOLD_EXPENSE_CATEGORIES.find(({ value: key }) => key === value)?.label ?? value;
}

function budgetCategoryLabel(value: HouseholdBudgetCategory) {
  return HOUSEHOLD_BUDGET_CATEGORIES.find(({ value: key }) => key === value)?.label ?? value;
}

function budgetDrafts(summary: HouseholdMonthlySpendingSummary) {
  return Object.fromEntries(
    summary.budgets.map((budget) => [
      budget.category,
      String(budget.budgetMinor / 100),
    ]),
  ) as Partial<Record<HouseholdBudgetCategory, string>>;
}

function MonthlyBudgets({
  householdId,
  selectedMonth,
  summary,
  readOnly,
}: {
  householdId: string;
  selectedMonth: string;
  summary: HouseholdMonthlySpendingSummary;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState(() => budgetDrafts(summary));
  const [busyCategory, setBusyCategory] = useState<HouseholdBudgetCategory | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const saveBudget = (category: HouseholdBudgetCategory) => {
    setBusyCategory(category);
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await setHouseholdMonthlyBudgetAction({
        householdId,
        month: selectedMonth,
        category,
        amountRupees: drafts[category]?.trim() || null,
      });
      if (result.success) {
        setMessage(result.message);
        router.refresh();
      } else {
        setError(result.message);
      }
      setBusyCategory(null);
    });
  };

  return (
    <div className="mt-4 rounded-2xl border border-border/65 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <Gauge aria-hidden="true" className="size-4 text-primary" /> Monthly budgets
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Shared limits reset for each billing month. Utilities combine electricity and internet.
          </p>
        </div>
        {!readOnly ? (
          <button type="button" onClick={() => setEditing((value) => !value)} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold transition hover:border-primary/30 hover:text-primary">
            <Pencil aria-hidden="true" className="size-3.5" /> {editing ? "Done" : "Set budgets"}
          </button>
        ) : null}
      </div>

      {summary.budgets.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {summary.budgets.map((budget) => {
            const reached = budget.threshold !== "BELOW";
            return (
              <div id={`budget-${budget.category.toLowerCase()}`} key={budget.id} className="scroll-mt-24 rounded-xl bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">{budgetCategoryLabel(budget.category)}</span>
                  <span className={reached ? "font-bold text-amber-700" : "text-muted-foreground"}>
                    {budget.usagePercent}% used
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${budget.threshold === "ONE_HUNDRED" ? "bg-rose-500" : budget.threshold === "EIGHTY" ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.max(0, budget.usagePercent))}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">{formatHouseholdAmount(budget.spendMinor)}</strong> spent of {formatHouseholdAmount(budget.budgetMinor)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
          No limits set for {monthLabel(selectedMonth)} yet.
        </p>
      )}

      {editing && !readOnly ? (
        <div className="mt-4 grid gap-2 border-t border-border/65 pt-4 sm:grid-cols-2">
          {HOUSEHOLD_BUDGET_CATEGORIES.map((category) => (
            <label key={category.value} className="text-xs font-semibold text-muted-foreground">
              {category.label}
              <span className="mt-1.5 flex gap-2">
                <input type="number" min="0.01" max="1000000" step="0.01" value={drafts[category.value] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [category.value]: event.target.value }))} placeholder="No limit" className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
                <button type="button" aria-label={`Save ${category.label}`} disabled={pending} onClick={() => saveBudget(category.value)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
                  {busyCategory === category.value ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}
                </button>
              </span>
            </label>
          ))}
          <p className="text-[0.6875rem] leading-5 text-muted-foreground sm:col-span-2">
            Leave a value blank and save to remove that limit. Alerts are sent once at 80% and again at 100% for each month.
          </p>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">{message}</p> : null}
    </div>
  );
}

export function MonthlySpendingSummary({
  householdId,
  selectedMonth,
  summary,
  readOnly,
}: {
  householdId: string;
  selectedMonth: string;
  summary: HouseholdMonthlySpendingSummary | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectMonth = (month: string) => {
    if (!month) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const maximumCategory = Math.max(
    1,
    ...(summary?.categories.map(({ amountMinor }) => amountMinor) ?? []),
  );

  return (
    <section className="mb-5 rounded-2xl border border-border/75 bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <ChartNoAxesColumnIncreasing aria-hidden="true" className="size-4 text-primary" />
            Monthly spending
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Shared totals and your own balance for {monthLabel(selectedMonth)}.
          </p>
        </div>
        <label className="text-xs font-semibold text-muted-foreground">
          Month
          <span className="relative mt-1.5 block">
            <CalendarRange aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input
              aria-label="Spending summary month"
              type="month"
              value={selectedMonth}
              disabled={pending}
              onChange={(event) => selectMonth(event.target.value)}
              className="h-10 rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15 disabled:opacity-60"
            />
          </span>
        </label>
      </div>

      {!summary ? (
        <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This private monthly summary is temporarily unavailable.
        </div>
      ) : summary.expenseCount === 0 ? (
        <>
          <div className="mt-4 rounded-2xl border border-dashed border-border px-5 py-7 text-center">
            <ReceiptIndianRupee aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold">No shared expenses this month</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose another month or add an expense to the household ledger.</p>
          </div>
          <MonthlyBudgets key={`${selectedMonth}-${summary.budgets.map(({ id, budgetMinor }) => `${id}:${budgetMinor}`).join("-")}`} householdId={householdId} selectedMonth={selectedMonth} summary={summary} readOnly={readOnly} />
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Total shared expenses", value: summary.totalExpenseMinor, icon: ReceiptIndianRupee },
              { label: "Amount paid", value: summary.paidMinor, icon: WalletCards },
              { label: "Amount outstanding", value: summary.outstandingMinor, icon: CircleDollarSign },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="rounded-2xl border border-border/65 bg-muted/15 p-3.5">
                  <Icon aria-hidden="true" className="size-4 text-primary" />
                  <p className="mt-3 text-lg font-bold tracking-tight">{formatHouseholdAmount(metric.value)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{metric.label}</p>
                </div>
              );
            })}
          </div>

          <MonthlyBudgets key={`${selectedMonth}-${summary.budgets.map(({ id, budgetMinor }) => `${id}:${budgetMinor}`).join("-")}`} householdId={householdId} selectedMonth={selectedMonth} summary={summary} readOnly={readOnly} />

          <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <ShieldCheck aria-hidden="true" className="size-4" /> Your private summary
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Your share</p><p className="mt-1 font-bold">{formatHouseholdAmount(summary.viewer.shareMinor)}</p></div>
              <div><p className="text-xs text-muted-foreground">Your share paid</p><p className="mt-1 font-bold text-emerald-700">{formatHouseholdAmount(summary.viewer.paidMinor)}</p></div>
              <div><p className="text-xs text-muted-foreground">You still owe</p><p className="mt-1 font-bold text-rose-700">{formatHouseholdAmount(summary.viewer.outstandingMinor)}</p></div>
              <div><p className="text-xs text-muted-foreground">You paid for household</p><p className="mt-1 font-bold">{formatHouseholdAmount(summary.viewer.paidForHouseholdMinor)}</p></div>
            </div>
            <p className="mt-3 text-[0.6875rem] leading-5 text-muted-foreground">
              Other members can see shared household totals, but not this personal breakdown or your private settlement notes.
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/65 p-4">
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">By category</h4>
              <div className="mt-3 grid gap-3">
                {summary.categories.map((category) => (
                  <div key={category.category}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold">{categoryLabel(category.category)}</span>
                      <span>{formatHouseholdAmount(category.amountMinor)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (category.amountMinor / maximumCategory) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/65 p-4">
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Largest expenses</h4>
              <div className="mt-3 divide-y divide-border/65">
                {summary.largestExpenses.map((expense, index) => (
                  <div key={expense.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{expense.title}</span>
                      <span className="block text-xs text-muted-foreground">{categoryLabel(expense.category)}</span>
                    </span>
                    <span className="text-sm font-bold">{formatHouseholdAmount(expense.amountMinor)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
