"use client";

import {
  Archive,
  CalendarDays,
  Check,
  Circle,
  ClipboardCheck,
  HandCoins,
  HouseHeart,
  IndianRupee,
  Lightbulb,
  ListTodo,
  LoaderCircle,
  LogOut,
  NotebookPen,
  ReceiptIndianRupee,
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  archiveHouseholdAction,
  createHouseholdItemAction,
  deleteHouseholdItemAction,
  leaveHouseholdAction,
  setHouseholdItemCompletedAction,
} from "@/app/household/actions";
import { ExpenseSplitting } from "@/components/household/expense-splitting";
import { ExpenseTrends } from "@/components/household/expense-trends";
import { MonthlySpendingSummary } from "@/components/household/monthly-spending-summary";
import { Button } from "@/components/ui/button";
import {
  formatHouseholdAmount,
  HOUSEHOLD_ITEM_KINDS,
  HOUSEHOLD_RECURRENCES,
} from "@/lib/household";
import { cn } from "@/lib/utils";
import type {
  HouseholdItemKind,
  HouseholdPageData,
  HouseholdRecurrence,
  HouseholdView,
} from "@/types/household";

const kindIcons = {
  RENT_DUE: IndianRupee,
  UTILITY: Lightbulb,
  CHORE: RefreshCw,
  EXPENSE: HandCoins,
  NOTE: NotebookPen,
  TASK: ListTodo,
} satisfies Record<HouseholdItemKind, typeof Circle>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

export function HouseholdPage({ data }: { data: HouseholdPageData }) {
  if (!data.households.length) {
    return (
      <div className="surface-card mx-auto max-w-2xl p-8 text-center sm:p-12">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <HouseHeart aria-hidden="true" className="size-7" />
        </span>
        <h2 className="mt-5 text-xl font-bold">No active household yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          This space appears after both participants in a finalized match confirm that
          move-in is complete. Leaving a household removes access to all its private data.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {data.households.map((household) => (
        <HouseholdCard
          key={household.id}
          viewerId={data.viewerId}
          household={household}
          selectedMonth={data.selectedMonth}
        />
      ))}
    </div>
  );
}

function HouseholdCard({
  viewerId,
  household,
  selectedMonth,
}: {
  viewerId: string;
  household: HouseholdView;
  selectedMonth: string;
}) {
  const router = useRouter();
  const readOnly = household.status === "ARCHIVED";
  const [kind, setKind] = useState<HouseholdItemKind>("TASK");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<HouseholdRecurrence>("NONE");
  const [assignedToId, setAssignedToId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const financial = kind === "RENT_DUE";
  const activeMembers = household.members.filter(({ status }) => status === "ACTIVE");

  const refresh = (result: { success: boolean; message: string }) => {
    if (!result.success) setError(result.message);
    else {
      setMessage(result.message);
      router.refresh();
    }
  };

  const createItem = () => {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await createHouseholdItemAction({
        householdId: household.id,
        kind,
        title,
        detail,
        amountRupees: financial ? amount : "",
        dueDate,
        recurrence,
        assignedToId,
      });
      if (result.success) {
        setTitle("");
        setDetail("");
        setAmount("");
        setDueDate("");
        setRecurrence("NONE");
        setAssignedToId("");
      }
      refresh(result);
    });
  };

  const complete = (itemId: string, completed: boolean) => {
    setBusyId(itemId);
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await setHouseholdItemCompletedAction({
        householdId: household.id,
        itemId,
        completed,
      });
      setBusyId(null);
      refresh(result);
    });
  };

  const remove = (itemId: string) => {
    if (!window.confirm("Remove this household item?")) return;
    setBusyId(itemId);
    startTransition(async () => {
      const result = await deleteHouseholdItemAction({ householdId: household.id, itemId });
      setBusyId(null);
      refresh(result);
    });
  };

  const archive = () => {
    if (!window.confirm("Archive this household for both active members? Its history will become read-only.")) return;
    startTransition(async () => refresh(await archiveHouseholdAction(household.id)));
  };

  const leave = () => {
    if (!window.confirm("Leave this household? You will immediately lose access to its tasks, notes, and financial details.")) return;
    startTransition(async () => refresh(await leaveHouseholdAction(household.id)));
  };

  return (
    <article className="surface-card overflow-hidden">
      <header className="border-b border-border/70 bg-muted/20 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold",
              readOnly
                ? "border-slate-200 bg-slate-100 text-slate-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}>
              {readOnly ? <Archive aria-hidden="true" className="size-3.5" /> : <UsersRound aria-hidden="true" className="size-3.5" />}
              {readOnly ? "Archived · read-only" : "Active household"}
            </span>
            <h2 className="mt-3 text-xl font-bold tracking-tight">{household.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{household.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly ? (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={archive}>
                <Archive aria-hidden="true" className="size-3.5" /> Archive
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={leave}>
              <LogOut aria-hidden="true" className="size-3.5" /> Leave
            </Button>
          </div>
        </div>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
          Amounts and notes are visible only to active members. Do not store bank details,
          payment credentials, full account numbers, or sensitive identity documents here.
          Roomzi records coordination only and does not collect or transfer money.
        </p>
      </header>

      <div className="p-5 sm:p-6">
        <MonthlySpendingSummary
          householdId={household.id}
          selectedMonth={selectedMonth}
          summary={household.monthlySpendingSummary}
          readOnly={readOnly}
        />
        <ExpenseTrends trends={household.expenseTrends} />
        <ExpenseSplitting household={household} viewerId={viewerId} />

        {!readOnly ? (
          <section className="mt-5 rounded-2xl border border-border/75 bg-muted/15 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ClipboardCheck aria-hidden="true" className="size-4 text-primary" />
              Add a household item
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-semibold text-muted-foreground">
                Type
                <select value={kind} onChange={(event) => setKind(event.target.value as HouseholdItemKind)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                  {HOUSEHOLD_ITEM_KINDS.filter((item) => item.value !== "EXPENSE").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground sm:col-span-1 lg:col-span-2">
                Title
                <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Electricity bill or clean the kitchen" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Due date <span className="font-normal">(optional)</span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Repeat
                <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as HouseholdRecurrence)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                  {HOUSEHOLD_RECURRENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Responsible person <span className="font-normal">(optional)</span>
                <select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                  <option value="">Shared / unassigned</option>
                  {activeMembers.map((member) => <option key={member.userId} value={member.userId}>{member.isViewer ? "You" : member.name}</option>)}
                </select>
              </label>
              {financial ? (
                <label className="text-xs font-semibold text-muted-foreground">
                  Amount in rupees <span className="font-normal">(optional)</span>
                  <span className="relative mt-1.5 block">
                    <ReceiptIndianRupee aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <input type="number" min="1" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="12000" className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
                  </span>
                </label>
              ) : null}
              <label className={cn("text-xs font-semibold text-muted-foreground", financial ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-3")}>
                Short note <span className="font-normal">(optional)</span>
                <input value={detail} maxLength={500} onChange={(event) => setDetail(event.target.value)} placeholder="Keep it practical—never add banking or payment credentials" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={createItem} disabled={pending || !title.trim()}>
                {pending && !busyId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ListTodo aria-hidden="true" className="size-4" />}
                Add privately
              </Button>
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold">Household board</h3>
            <span className="text-xs text-muted-foreground">{household.items.filter(({ isCompleted }) => !isCompleted).length} open</span>
          </div>
          {household.items.length ? (
            <div className="mt-3 grid gap-3">
              {household.items.map((item) => {
                const Icon = kindIcons[item.kind];
                const assignee = household.members.find(({ userId }) => userId === item.assignedToId);
                const owned = item.createdById === viewerId;
                const itemBusy = busyId === item.id;
                const kindLabel = HOUSEHOLD_ITEM_KINDS.find(({ value }) => value === item.kind)?.label ?? "Household item";
                const amountLabel = formatHouseholdAmount(item.amountMinor);
                return (
                  <article key={item.id} className={cn("rounded-2xl border border-border/70 bg-background p-4", item.isCompleted && "bg-muted/25 opacity-75")}>
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Icon aria-hidden="true" className="size-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className={cn("font-semibold", item.isCompleted && "line-through")}>{item.title}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{kindLabel}</span>
                              {item.dueDate ? <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3" /> {formatDate(item.dueDate)}</span> : null}
                              {item.recurrence !== "NONE" ? <span>{item.recurrence === "WEEKLY" ? "Weekly" : "Monthly"}</span> : null}
                              {assignee ? <span>For {assignee.isViewer ? "you" : assignee.name}</span> : null}
                              {amountLabel ? <span className="font-semibold text-foreground">{amountLabel}</span> : null}
                            </div>
                            {item.detail ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p> : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {!readOnly ? (
                              <Button type="button" variant="outline" size="sm" disabled={pending || itemBusy} onClick={() => complete(item.id, !item.isCompleted)}>
                                {itemBusy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : item.isCompleted ? <Check aria-hidden="true" className="size-3.5" /> : <Circle aria-hidden="true" className="size-3.5" />}
                                {item.isCompleted ? "Completed" : "Mark complete"}
                              </Button>
                            ) : null}
                            {owned && !readOnly ? (
                              <Button type="button" variant="ghost" size="sm" disabled={pending || itemBusy} onClick={() => remove(item.id)} aria-label={`Remove ${item.title}`}>
                                <Trash2 aria-hidden="true" className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-8 text-center">
              <ListTodo aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Nothing on the household board yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add a chore, utility responsibility, rent reminder, task, or note.</p>
            </div>
          )}
        </section>

        {error ? <p role="alert" className="mt-4 text-sm font-medium text-destructive">{error}</p> : null}
        {message ? <p role="status" className="mt-4 text-sm font-medium text-emerald-700">{message}</p> : null}
      </div>
    </article>
  );
}
