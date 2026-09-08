"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  IndianRupee,
  LoaderCircle,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createSharedExpenseAction,
  deleteSharedExpenseAction,
  recordSettlementAction,
  setSettlementStatusAction,
} from "@/app/household/actions";
import { Button } from "@/components/ui/button";
import { RecurringBills } from "@/components/household/recurring-bills";
import {
  formatHouseholdAmount,
  HOUSEHOLD_EXPENSE_CATEGORIES,
  HOUSEHOLD_SPLIT_METHODS,
  householdAmountMinor,
  householdBillState,
  outstandingExpenseAmountMinor,
  splitExpenseAmountMinor,
} from "@/lib/household";
import { cn } from "@/lib/utils";
import type {
  HouseholdExpenseCategory,
  HouseholdExpenseShareView,
  HouseholdExpenseSplitMethod,
  HouseholdBillState,
  HouseholdSettlementView,
  HouseholdView,
} from "@/types/household";

const billStateLabels: Record<HouseholdBillState, string> = {
  UPCOMING: "Upcoming",
  DUE_TODAY: "Due today",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

const billStateStyles: Record<HouseholdBillState, string> = {
  UPCOMING: "border-sky-200 bg-sky-50 text-sky-800",
  DUE_TODAY: "border-amber-200 bg-amber-50 text-amber-800",
  PARTIALLY_PAID: "border-violet-200 bg-violet-50 text-violet-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  OVERDUE: "border-rose-200 bg-rose-50 text-rose-800",
};

function localDateValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function statusLabel(status: string) {
  if (status === "PARTIALLY_SETTLED") return "Partly settled";
  if (status === "SETTLED") return "Settled";
  if (status === "NO_PAYMENT_DUE") return "Included in payment";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "PENDING") return "Awaiting confirmation";
  return "Outstanding";
}

export function ExpenseSplitting({
  household,
  viewerId,
}: {
  household: HouseholdView;
  viewerId: string;
}) {
  const router = useRouter();
  const readOnly = household.status === "ARCHIVED";
  const activeMembers = household.members.filter(({ status }) => status === "ACTIVE");
  const [category, setCategory] = useState<HouseholdExpenseCategory>("GROCERIES");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(localDateValue);
  const [paidById, setPaidById] = useState(viewerId);
  const [splitMethod, setSplitMethod] = useState<HouseholdExpenseSplitMethod>("EQUAL");
  const [memberIds, setMemberIds] = useState(() => activeMembers.map(({ userId }) => userId));
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [settlingShareId, setSettlingShareId] = useState<string | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementNote, setSettlementNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => {
    const totalMinor = householdAmountMinor(amount);
    if (totalMinor === null || totalMinor === undefined) return null;
    const parsedCustom: Record<string, number> = {};
    if (splitMethod === "CUSTOM") {
      for (const memberId of memberIds) {
        const parsed = householdAmountMinor(customAmounts[memberId]);
        if (parsed === null || parsed === undefined) return null;
        parsedCustom[memberId] = parsed;
      }
    }
    return splitExpenseAmountMinor({
      totalMinor,
      memberIds,
      method: splitMethod,
      customAmountsMinor: parsedCustom,
    });
  }, [amount, customAmounts, memberIds, splitMethod]);

  const memberName = (userId: string | null) => {
    if (!userId) return "Household member";
    const member = household.members.find((candidate) => candidate.userId === userId);
    return member?.isViewer ? "You" : member?.name ?? "Household member";
  };

  const finish = (result: { success: boolean; message: string }) => {
    if (result.success) {
      setError("");
      setMessage(result.message);
      router.refresh();
    } else {
      setMessage("");
      setError(result.message);
    }
  };

  const toggleMember = (userId: string) => {
    setMemberIds((current) =>
      current.includes(userId)
        ? current.filter((memberId) => memberId !== userId)
        : [...current, userId],
    );
  };

  const createExpense = () => {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await createSharedExpenseAction({
        householdId: household.id,
        paidById,
        category,
        title,
        description,
        amountRupees: amount,
        expenseDate,
        splitMethod,
        memberIds,
        customAmountsRupees: customAmounts,
      });
      if (result.success) {
        setTitle("");
        setDescription("");
        setAmount("");
        setSplitMethod("EQUAL");
        setCustomAmounts({});
        setMemberIds(activeMembers.map(({ userId }) => userId));
      }
      finish(result);
    });
  };

  const removeExpense = (expenseId: string) => {
    if (!window.confirm("Remove this expense? Expenses with settlement history are kept for everyone’s records.")) return;
    setBusyId(expenseId);
    startTransition(async () => {
      finish(await deleteSharedExpenseAction({ householdId: household.id, expenseId }));
      setBusyId(null);
    });
  };

  const beginSettlement = (share: HouseholdExpenseShareView) => {
    const pendingMinor = share.settlements
      .filter(({ status }) => status === "PENDING")
      .reduce((sum, settlement) => sum + settlement.amountMinor, 0);
    const remaining = Math.max(
      0,
      outstandingExpenseAmountMinor(share) - pendingMinor,
    );
    setSettlingShareId(share.id);
    setSettlementAmount((remaining / 100).toFixed(remaining % 100 ? 2 : 0));
    setSettlementNote("");
    setError("");
    setMessage("");
  };

  const recordSettlement = (shareId: string) => {
    setBusyId(shareId);
    startTransition(async () => {
      const result = await recordSettlementAction({
        householdId: household.id,
        expenseShareId: shareId,
        amountRupees: settlementAmount,
        note: settlementNote,
      });
      if (result.success) {
        setSettlingShareId(null);
        setSettlementAmount("");
        setSettlementNote("");
      }
      finish(result);
      setBusyId(null);
    });
  };

  const updateSettlement = (
    settlement: HouseholdSettlementView,
    status: "CONFIRMED" | "CANCELLED",
  ) => {
    setBusyId(settlement.id);
    startTransition(async () => {
      finish(await setSettlementStatusAction({
        householdId: household.id,
        settlementId: settlement.id,
        status,
      }));
      setBusyId(null);
    });
  };

  return (
    <section className="rounded-2xl border border-border/75 bg-background p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <CircleDollarSign aria-hidden="true" className="size-4 text-primary" />
            Shared expenses
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Split household costs and record settlements. Entries are private coordination
            records—not payment confirmations from a bank or payment service.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.6875rem] font-semibold text-emerald-800">
          <ShieldCheck aria-hidden="true" className="size-3.5" /> Members only
        </span>
      </div>

      <RecurringBills household={household} viewerId={viewerId} />

      {!readOnly ? (
        <div className="mt-5 rounded-2xl border border-border/70 bg-muted/15 p-4">
          <h4 className="text-sm font-bold">Record an expense</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-muted-foreground">
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value as HouseholdExpenseCategory)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                {HOUSEHOLD_EXPENSE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-1 lg:col-span-2">
              Expense title
              <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. September electricity bill" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Total amount
              <span className="relative mt-1.5 block">
                <IndianRupee aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <input type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="2400" className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </span>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Expense date
              <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Paid by
              <select value={paidById} onChange={(event) => setPaidById(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                {activeMembers.map((member) => <option key={member.userId} value={member.userId}>{member.isViewer ? "You" : member.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Split method
              <select value={splitMethod} onChange={(event) => setSplitMethod(event.target.value as HouseholdExpenseSplitMethod)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                {HOUSEHOLD_SPLIT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground">Split among</p>
              <div className="mt-1.5 flex min-h-11 flex-wrap gap-2">
                {activeMembers.map((member) => {
                  const selected = memberIds.includes(member.userId);
                  return (
                    <button key={member.userId} type="button" aria-pressed={selected} onClick={() => toggleMember(member.userId)} className={cn("rounded-xl border px-3 py-2 text-xs font-semibold transition", selected ? "border-primary/30 bg-primary/8 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/25")}>
                      {selected ? <Check aria-hidden="true" className="mr-1 inline size-3.5" /> : null}
                      {member.isViewer ? "You" : member.name}
                    </button>
                  );
                })}
              </div>
            </div>
            {splitMethod === "CUSTOM" ? memberIds.map((memberId) => (
              <label key={memberId} className="text-xs font-semibold text-muted-foreground">
                {memberName(memberId)} share
                <input type="number" min="0.01" max="1000000" step="0.01" value={customAmounts[memberId] ?? ""} onChange={(event) => setCustomAmounts((current) => ({ ...current, [memberId]: event.target.value }))} placeholder="0" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </label>
            )) : null}
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-2 lg:col-span-3">
              Note <span className="font-normal">(optional)</span>
              <input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="Do not add bank, card, UPI, or account details" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
          </div>
          {preview ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {preview.map((share) => (
                <span key={share.memberId} className="rounded-full bg-background px-2.5 py-1 ring-1 ring-border">
                  {memberName(share.memberId)}: <strong className="text-foreground">{formatHouseholdAmount(share.amountMinor)}</strong>
                </span>
              ))}
            </div>
          ) : amount && memberIds.length ? (
            <p role="alert" className="mt-3 text-xs font-medium text-destructive">
              {splitMethod === "CUSTOM" ? "Custom shares must add up to the total." : "Check the amount and selected members."}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button type="button" disabled={pending || !title.trim() || !preview} onClick={createExpense}>
              {pending && !busyId ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ReceiptText aria-hidden="true" className="size-4" />}
              Add shared expense
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold">Expense ledger</h4>
        <span className="text-xs text-muted-foreground">{household.expenses.length} recorded</span>
      </div>
      {household.expenses.length ? (
        <div className="mt-3 grid gap-4">
          {household.expenses.map((expense) => {
            const expenseSettlements = expense.shares.flatMap(({ settlements }) => settlements);
            const viewerShare = expense.shares.find(({ memberId }) => memberId === viewerId);
            const viewerBillState = viewerShare
              ? householdBillState({
                  dueDate: expense.dueDate,
                  shareAmountMinor: viewerShare.shareAmountMinor,
                  settledAmountMinor: viewerShare.settledAmountMinor,
                  shareStatus: viewerShare.status,
                  creditorId: viewerShare.creditorId,
                })
              : null;
            const categoryLabel = HOUSEHOLD_EXPENSE_CATEGORIES.find(({ value }) => value === expense.category)?.label ?? "Expense";
            return (
              <article id={`expense-${expense.id}`} key={expense.id} className="scroll-mt-24 rounded-2xl border border-border/70 bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{expense.title}</p>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", expense.status === "SETTLED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : expense.status === "PARTIALLY_SETTLED" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-800")}>{statusLabel(expense.status)}</span>
                      {viewerBillState ? (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", billStateStyles[viewerBillState])}>
                          Your share: {billStateLabels[viewerBillState]}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{categoryLabel}</span>
                      <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3" />{formatDate(expense.expenseDate)}</span>
                      <span>Paid by {memberName(expense.paidById).toLowerCase()}</span>
                      <span>{expense.splitMethod === "EQUAL" ? "Equal split" : "Custom split"}</span>
                      {expense.recurringTemplateId ? <span className="inline-flex items-center gap-1"><Repeat2 aria-hidden="true" className="size-3" />Recurring bill</span> : null}
                      {expense.dueDate ? <span>Due {formatDate(expense.dueDate)}</span> : null}
                    </div>
                    {expense.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{expense.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2 sm:text-right">
                    <p className="text-lg font-bold">{formatHouseholdAmount(expense.amountMinor)}</p>
                    {!readOnly && expense.createdById === viewerId && !expenseSettlements.length ? (
                      <Button type="button" variant="ghost" size="sm" disabled={pending || busyId === expense.id} onClick={() => removeExpense(expense.id)} aria-label={`Remove ${expense.title}`}>
                        {busyId === expense.id ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Trash2 aria-hidden="true" className="size-3.5" />}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {expense.shares.map((share) => {
                    const remaining = outstandingExpenseAmountMinor(share);
                    const viewerInvolved = [share.memberId, share.creditorId].includes(viewerId);
                    const pendingMinor = share.settlements.filter(({ status }) => status === "PENDING").reduce((sum, settlement) => sum + settlement.amountMinor, 0);
                    const canRecord = !readOnly && share.creditorId !== null && remaining - pendingMinor > 0 && [share.memberId, share.creditorId].includes(viewerId);
                    return (
                      <div key={share.id} className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs">
                            <span className="font-semibold text-foreground">{memberName(share.memberId)}</span>
                            {share.creditorId ? <span className="text-muted-foreground"> owes {memberName(share.creditorId).toLowerCase()}</span> : <span className="text-muted-foreground"> paid the expense</span>}
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                              <span>Share: {formatHouseholdAmount(share.shareAmountMinor)}</span>
                              {share.creditorId && viewerInvolved ? <span>Remaining: <strong className="text-foreground">{formatHouseholdAmount(remaining)}</strong></span> : null}
                              {viewerInvolved || !share.creditorId ? <span>{statusLabel(share.status)}</span> : <span>Settlement details private</span>}
                            </div>
                          </div>
                          {canRecord ? (
                            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => beginSettlement(share)}>
                              <CircleDollarSign aria-hidden="true" className="size-3.5" /> Record settlement
                            </Button>
                          ) : null}
                        </div>
                        {settlingShareId === share.id ? (
                          <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-[9rem_1fr_auto]">
                            <input aria-label="Settlement amount in rupees" type="number" min="0.01" step="0.01" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
                            <input aria-label="Settlement note" value={settlementNote} maxLength={240} onChange={(event) => setSettlementNote(event.target.value)} placeholder="Optional private note" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" disabled={pending || !settlementAmount} onClick={() => recordSettlement(share.id)}>Record</Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setSettlingShareId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {expenseSettlements.length ? (
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold"><Clock3 aria-hidden="true" className="size-3.5" /> Settlement history</p>
                    <div className="mt-2 grid gap-2">
                      {expenseSettlements.map((settlement) => {
                        const canConfirm = !readOnly && settlement.status === "PENDING" && settlement.recordedById !== viewerId && [settlement.fromUserId, settlement.toUserId].includes(viewerId);
                        const canCancel = !readOnly && settlement.status === "PENDING" && [settlement.fromUserId, settlement.toUserId].includes(viewerId);
                        return (
                          <div key={settlement.id} className="flex flex-col gap-2 rounded-xl bg-muted/20 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-foreground">
                                {memberName(settlement.fromUserId)} <ArrowRight aria-hidden="true" className="mx-1 inline size-3" /> {memberName(settlement.toUserId).toLowerCase()} · {formatHouseholdAmount(settlement.amountMinor)}
                              </p>
                              <p className="mt-0.5 text-muted-foreground">{statusLabel(settlement.status)}{settlement.note ? ` · ${settlement.note}` : ""}</p>
                            </div>
                            {(canConfirm || canCancel) ? (
                              <div className="flex gap-2">
                                {canConfirm ? <Button type="button" size="sm" disabled={pending || busyId === settlement.id} onClick={() => updateSettlement(settlement, "CONFIRMED")}><Check aria-hidden="true" className="size-3.5" /> Confirm</Button> : null}
                                {canCancel ? <Button type="button" size="sm" variant="outline" disabled={pending || busyId === settlement.id} onClick={() => updateSettlement(settlement, "CANCELLED")}><X aria-hidden="true" className="size-3.5" /> Cancel</Button> : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <UsersRound aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No shared expenses yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add rent, utilities, groceries, maintenance, or another household cost.</p>
        </div>
      )}

      {error ? <p role="alert" className="mt-4 text-sm font-medium text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-4 text-sm font-medium text-emerald-700">{message}</p> : null}
    </section>
  );
}
