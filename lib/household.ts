import type {
  HouseholdBillState,
  HouseholdBudgetCategory,
  HouseholdBudgetThreshold,
  HouseholdExpenseCategory,
  HouseholdExpenseShareStatus,
  HouseholdExpenseSplitMethod,
  HouseholdItemKind,
  HouseholdRecurrence,
} from "@/types/household";

export const HOUSEHOLD_BILL_REMINDER_LEAD_DAYS = 3;

export const HOUSEHOLD_BUDGET_CATEGORIES: ReadonlyArray<{
  value: HouseholdBudgetCategory;
  label: string;
}> = [
  { value: "OVERALL", label: "Overall monthly budget" },
  { value: "RENT", label: "Rent" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "SUBSCRIPTIONS", label: "Subscriptions" },
  { value: "OTHER", label: "Other shared expenses" },
] as const;

export function currentHouseholdMonth(now = new Date()) {
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 7);
}

export function householdMonthValue(value: unknown, fallback = currentHouseholdMonth()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return fallback;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12 ? value : fallback;
}

export const HOUSEHOLD_EXPENSE_CATEGORIES: ReadonlyArray<{
  value: HouseholdExpenseCategory;
  label: string;
}> = [
  { value: "RENT", label: "Rent" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "INTERNET", label: "Internet" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "OTHER", label: "Other" },
] as const;

export const HOUSEHOLD_SPLIT_METHODS: ReadonlyArray<{
  value: HouseholdExpenseSplitMethod;
  label: string;
}> = [
  { value: "EQUAL", label: "Split equally" },
  { value: "CUSTOM", label: "Custom amounts" },
] as const;

export const HOUSEHOLD_ITEM_KINDS: ReadonlyArray<{
  value: HouseholdItemKind;
  label: string;
  description: string;
}> = [
  { value: "RENT_DUE", label: "Rent due", description: "Track a due date or reminder only." },
  { value: "UTILITY", label: "Utility", description: "Assign electricity, water, internet, or gas." },
  { value: "CHORE", label: "Recurring chore", description: "Share cleaning and household routines." },
  { value: "EXPENSE", label: "Shared expense", description: "Record a private amount without processing payment." },
  { value: "TASK", label: "House task", description: "Keep a simple shared to-do." },
  { value: "NOTE", label: "House note", description: "Share a short household note." },
] as const;

export const HOUSEHOLD_RECURRENCES: ReadonlyArray<{
  value: HouseholdRecurrence;
  label: string;
}> = [
  { value: "NONE", label: "One-time" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
] as const;

export function isHouseholdItemKind(value: unknown): value is HouseholdItemKind {
  return HOUSEHOLD_ITEM_KINDS.some((item) => item.value === value);
}

export function isHouseholdRecurrence(value: unknown): value is HouseholdRecurrence {
  return HOUSEHOLD_RECURRENCES.some((item) => item.value === value);
}

export function isHouseholdExpenseCategory(
  value: unknown,
): value is HouseholdExpenseCategory {
  return HOUSEHOLD_EXPENSE_CATEGORIES.some((item) => item.value === value);
}

export function isHouseholdBudgetCategory(
  value: unknown,
): value is HouseholdBudgetCategory {
  return HOUSEHOLD_BUDGET_CATEGORIES.some((category) => category.value === value);
}

export function householdBudgetUsage(input: {
  spendMinor: number;
  budgetMinor: number;
}): { usagePercent: number; threshold: HouseholdBudgetThreshold } {
  if (
    !Number.isFinite(input.spendMinor) ||
    !Number.isFinite(input.budgetMinor) ||
    input.spendMinor < 0 ||
    input.budgetMinor <= 0
  ) {
    return { usagePercent: 0, threshold: "BELOW" };
  }
  const usagePercent = Math.round((input.spendMinor / input.budgetMinor) * 100);
  const ratio = input.spendMinor / input.budgetMinor;
  return {
    usagePercent,
    threshold:
      ratio >= 1
        ? "ONE_HUNDRED"
        : ratio >= 0.8
          ? "EIGHTY"
          : "BELOW",
  };
}

export function isHouseholdSplitMethod(
  value: unknown,
): value is HouseholdExpenseSplitMethod {
  return HOUSEHOLD_SPLIT_METHODS.some((item) => item.value === value);
}

export function cleanHouseholdText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maximum) : null;
}

export function householdAmountMinor(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return undefined;
  return Math.round(amount * 100);
}

export function formatHouseholdAmount(amountMinor: number | null) {
  if (amountMinor === null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amountMinor % 100 ? 2 : 0,
  }).format(amountMinor / 100);
}

export function splitExpenseAmountMinor(input: {
  totalMinor: number;
  memberIds: string[];
  method: HouseholdExpenseSplitMethod;
  customAmountsMinor?: Record<string, number>;
}) {
  const memberIds = [...input.memberIds];
  if (
    !Number.isSafeInteger(input.totalMinor) ||
    input.totalMinor <= 0 ||
    !memberIds.length ||
    new Set(memberIds).size !== memberIds.length ||
    memberIds.some((memberId) => !memberId)
  ) {
    return null;
  }

  if (input.method === "EQUAL") {
    if (input.totalMinor < memberIds.length) return null;
    const base = Math.floor(input.totalMinor / memberIds.length);
    let remainder = input.totalMinor % memberIds.length;
    return memberIds.map((memberId) => {
      const amountMinor = base + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      return { memberId, amountMinor };
    });
  }

  const amounts = input.customAmountsMinor;
  if (!amounts) return null;
  const shares = memberIds.map((memberId) => ({
    memberId,
    amountMinor: amounts[memberId],
  }));
  if (
    shares.some(
      ({ amountMinor }) =>
        !Number.isSafeInteger(amountMinor) || amountMinor <= 0,
    ) ||
    shares.reduce((total, { amountMinor }) => total + amountMinor, 0) !==
      input.totalMinor
  ) {
    return null;
  }
  return shares;
}

export function outstandingExpenseAmountMinor(input: {
  shareAmountMinor: number;
  settledAmountMinor: number;
}) {
  if (
    !Number.isSafeInteger(input.shareAmountMinor) ||
    !Number.isSafeInteger(input.settledAmountMinor)
  ) {
    return 0;
  }
  return Math.max(0, input.shareAmountMinor - input.settledAmountMinor);
}

function householdDateValue(value: string | Date) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
  }
  const dateValue = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : null;
}

export function householdBillState(input: {
  dueDate: string | null;
  shareAmountMinor: number;
  settledAmountMinor: number;
  shareStatus: HouseholdExpenseShareStatus;
  creditorId: string | null;
  asOf?: string | Date;
}): HouseholdBillState | null {
  if (!input.dueDate) return null;
  const dueDate = householdDateValue(input.dueDate);
  const asOf = householdDateValue(input.asOf ?? new Date());
  if (!dueDate || !asOf) return null;

  const remaining = outstandingExpenseAmountMinor(input);
  if (
    input.creditorId === null ||
    remaining === 0 ||
    input.shareStatus === "SETTLED" ||
    input.shareStatus === "NO_PAYMENT_DUE"
  ) {
    return "PAID";
  }
  if (dueDate < asOf) return "OVERDUE";
  if (input.shareStatus === "PARTIALLY_SETTLED") return "PARTIALLY_PAID";
  if (dueDate === asOf) return "DUE_TODAY";
  return "UPCOMING";
}

export function monthlyDueDateForCycle(
  cycleStart: string | Date,
  dueDay: number,
) {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
  const parsed =
    cycleStart instanceof Date
      ? new Date(cycleStart.getTime())
      : new Date(`${cycleStart.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dueDay, lastDay)))
    .toISOString()
    .slice(0, 10);
}
