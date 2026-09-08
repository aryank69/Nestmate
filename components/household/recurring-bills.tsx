"use client";

import {
  CalendarClock,
  Check,
  CirclePause,
  CirclePlay,
  IndianRupee,
  LoaderCircle,
  Pencil,
  Repeat2,
  StopCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createRecurringExpenseAction,
  setRecurringExpenseStatusAction,
  updateRecurringExpenseAction,
} from "@/app/household/actions";
import { Button } from "@/components/ui/button";
import {
  formatHouseholdAmount,
  HOUSEHOLD_EXPENSE_CATEGORIES,
  HOUSEHOLD_SPLIT_METHODS,
  householdAmountMinor,
  splitExpenseAmountMinor,
} from "@/lib/household";
import { cn } from "@/lib/utils";
import type {
  HouseholdExpenseCategory,
  HouseholdExpenseSplitMethod,
  HouseholdRecurringTemplateView,
  HouseholdView,
} from "@/types/household";

function localDateValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function rupeeInput(amountMinor: number) {
  return (amountMinor / 100).toFixed(amountMinor % 100 ? 2 : 0);
}

export function RecurringBills({
  household,
  viewerId,
}: {
  household: HouseholdView;
  viewerId: string;
}) {
  const router = useRouter();
  const activeMembers = household.members.filter(({ status }) => status === "ACTIVE");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<HouseholdExpenseCategory>("RENT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [firstDueDate, setFirstDueDate] = useState(localDateValue);
  const [endDate, setEndDate] = useState("");
  const [paidById, setPaidById] = useState(viewerId);
  const [splitMethod, setSplitMethod] = useState<HouseholdExpenseSplitMethod>("EQUAL");
  const [memberIds, setMemberIds] = useState(() => activeMembers.map(({ userId }) => userId));
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const memberName = (userId: string) => {
    const member = household.members.find((candidate) => candidate.userId === userId);
    return member?.isViewer ? "You" : member?.name ?? "Household member";
  };

  const preview = useMemo(() => {
    const totalMinor = householdAmountMinor(amount);
    if (totalMinor === null || totalMinor === undefined) return null;
    const customAmountsMinor: Record<string, number> = {};
    if (splitMethod === "CUSTOM") {
      for (const memberId of memberIds) {
        const parsed = householdAmountMinor(customAmounts[memberId]);
        if (parsed === null || parsed === undefined) return null;
        customAmountsMinor[memberId] = parsed;
      }
    }
    return splitExpenseAmountMinor({
      totalMinor,
      memberIds,
      method: splitMethod,
      customAmountsMinor,
    });
  }, [amount, customAmounts, memberIds, splitMethod]);

  const resetForm = () => {
    setEditingId(null);
    setCategory("RENT");
    setTitle("");
    setDescription("");
    setAmount("");
    setFirstDueDate(localDateValue());
    setEndDate("");
    setPaidById(viewerId);
    setSplitMethod("EQUAL");
    setMemberIds(activeMembers.map(({ userId }) => userId));
    setCustomAmounts({});
  };

  const editTemplate = (template: HouseholdRecurringTemplateView) => {
    setEditingId(template.id);
    setCategory(template.category);
    setTitle(template.title);
    setDescription(template.description ?? "");
    setAmount(rupeeInput(template.amountMinor));
    setFirstDueDate(template.firstDueDate.slice(0, 10));
    setEndDate(template.endDate?.slice(0, 10) ?? "");
    setPaidById(template.paidById);
    setSplitMethod(template.splitMethod);
    setMemberIds(template.participants.map(({ memberId }) => memberId));
    setCustomAmounts(Object.fromEntries(
      template.participants
        .filter(({ customAmountMinor }) => customAmountMinor !== null)
        .map(({ memberId, customAmountMinor }) => [memberId, rupeeInput(customAmountMinor ?? 0)]),
    ));
    setShowForm(true);
    setError("");
    setMessage("");
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

  const submit = () => {
    setError("");
    setMessage("");
    startTransition(async () => {
      const input = {
        householdId: household.id,
        paidById,
        category,
        title,
        description,
        amountRupees: amount,
        firstDueDate,
        endDate,
        splitMethod,
        memberIds,
        customAmountsRupees: customAmounts,
      };
      const result = editingId
        ? await updateRecurringExpenseAction({ ...input, templateId: editingId })
        : await createRecurringExpenseAction(input);
      if (result.success) {
        resetForm();
        setShowForm(false);
      }
      finish(result);
    });
  };

  const setStatus = (
    template: HouseholdRecurringTemplateView,
    status: "ACTIVE" | "PAUSED" | "ENDED",
  ) => {
    if (status === "ENDED" && !window.confirm("End this recurring bill? Existing generated expenses and settlements will be preserved.")) return;
    setBusyId(template.id);
    startTransition(async () => {
      finish(await setRecurringExpenseStatusAction({
        householdId: household.id,
        templateId: template.id,
        status,
      }));
      setBusyId(null);
    });
  };

  return (
    <div className="mt-5 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold">
            <Repeat2 aria-hidden="true" className="size-4 text-primary" /> Monthly recurring bills
          </h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Bills are generated once per monthly cycle, seven days before they are due.
          </p>
        </div>
        {household.status === "ACTIVE" ? (
          <Button type="button" size="sm" variant={showForm ? "outline" : "default"} onClick={() => { if (showForm) resetForm(); setShowForm((value) => !value); }}>
            {showForm ? "Close form" : "Add recurring bill"}
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="text-sm font-bold">{editingId ? "Edit future cycles" : "New monthly bill"}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-muted-foreground">
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value as HouseholdExpenseCategory)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                {HOUSEHOLD_EXPENSE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-1 lg:col-span-2">
              Bill title
              <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Monthly rent" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Monthly amount
              <span className="relative mt-1.5 block">
                <IndianRupee aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <input type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </span>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              First due date
              <input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              End date <span className="font-normal">(optional)</span>
              <input type="date" min={firstDueDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Paid by
              <select value={paidById} onChange={(event) => setPaidById(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                {activeMembers.map((member) => <option key={member.userId} value={member.userId}>{memberName(member.userId)}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Split method
              <select value={splitMethod} onChange={(event) => setSplitMethod(event.target.value as HouseholdExpenseSplitMethod)} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15">
                {HOUSEHOLD_SPLIT_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground">Participants</p>
              <div className="mt-1.5 flex min-h-11 flex-wrap gap-2">
                {activeMembers.map((member) => {
                  const selected = memberIds.includes(member.userId);
                  return <button key={member.userId} type="button" aria-pressed={selected} onClick={() => setMemberIds((current) => selected ? current.filter((id) => id !== member.userId) : [...current, member.userId])} className={cn("rounded-xl border px-3 py-2 text-xs font-semibold transition", selected ? "border-primary/30 bg-primary/8 text-primary" : "border-border bg-background text-muted-foreground")}>
                    {selected ? <Check aria-hidden="true" className="mr-1 inline size-3.5" /> : null}{memberName(member.userId)}
                  </button>;
                })}
              </div>
            </div>
            {splitMethod === "CUSTOM" ? memberIds.map((memberId) => (
              <label key={memberId} className="text-xs font-semibold text-muted-foreground">
                {memberName(memberId)} share
                <input type="number" min="0.01" step="0.01" value={customAmounts[memberId] ?? ""} onChange={(event) => setCustomAmounts((current) => ({ ...current, [memberId]: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
              </label>
            )) : null}
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-2 lg:col-span-3">
              Note <span className="font-normal">(optional)</span>
              <input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="No bank, card, UPI, or account details" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />
            </label>
          </div>
          {preview ? <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{preview.map((share) => <span key={share.memberId} className="rounded-full bg-background px-2.5 py-1 ring-1 ring-border">{memberName(share.memberId)}: <strong className="text-foreground">{formatHouseholdAmount(share.amountMinor)}</strong></span>)}</div> : amount ? <p role="alert" className="mt-3 text-xs font-medium text-destructive">Check that every share adds up to the monthly total.</p> : null}
          <div className="mt-4 flex justify-end">
            <Button type="button" disabled={pending || !title.trim() || !preview || !firstDueDate} onClick={submit}>
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <CalendarClock aria-hidden="true" className="size-4" />}
              {editingId ? "Save future cycles" : "Create monthly bill"}
            </Button>
          </div>
        </div>
      ) : null}

      {household.recurringExpenseTemplates.length ? (
        <div className="mt-4 grid gap-2">
          {household.recurringExpenseTemplates.map((template) => (
            <article key={template.id} className="rounded-xl border border-border/60 bg-background px-3.5 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{template.title}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", template.status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : template.status === "PAUSED" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-100 text-slate-700")}>{template.status === "ACTIVE" ? "Active" : template.status === "PAUSED" ? "Paused" : "Ended"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatHouseholdAmount(template.amountMinor)} monthly · due day {template.dueDay} · {template.splitMethod === "EQUAL" ? "equal split" : "custom split"} · paid by {memberName(template.paidById).toLowerCase()}
                    {template.endDate ? ` · ends ${template.endDate.slice(0, 10)}` : ""}
                  </p>
                </div>
                {household.status === "ACTIVE" && template.status !== "ENDED" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={pending || busyId === template.id} onClick={() => editTemplate(template)}><Pencil aria-hidden="true" className="size-3.5" /> Edit</Button>
                    <Button type="button" size="sm" variant="outline" disabled={pending || busyId === template.id} onClick={() => setStatus(template, template.status === "PAUSED" ? "ACTIVE" : "PAUSED")}>
                      {template.status === "PAUSED" ? <CirclePlay aria-hidden="true" className="size-3.5" /> : <CirclePause aria-hidden="true" className="size-3.5" />}
                      {template.status === "PAUSED" ? "Resume" : "Pause"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending || busyId === template.id} onClick={() => setStatus(template, "ENDED")}><StopCircle aria-hidden="true" className="size-3.5" /> End</Button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">No recurring bills yet.</p>}

      {error ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
    </div>
  );
}
