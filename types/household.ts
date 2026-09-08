export type HouseholdStatus = "ACTIVE" | "ARCHIVED";
export type HouseholdMemberStatus = "ACTIVE" | "LEFT";
export type HouseholdItemKind =
  | "RENT_DUE"
  | "UTILITY"
  | "CHORE"
  | "EXPENSE"
  | "NOTE"
  | "TASK";
export type HouseholdRecurrence = "NONE" | "WEEKLY" | "MONTHLY";
export type HouseholdExpenseCategory =
  | "RENT"
  | "ELECTRICITY"
  | "INTERNET"
  | "GROCERIES"
  | "MAINTENANCE"
  | "SUBSCRIPTION"
  | "OTHER";
export type HouseholdExpenseSplitMethod = "EQUAL" | "CUSTOM";
export type HouseholdExpenseStatus =
  | "OUTSTANDING"
  | "PARTIALLY_SETTLED"
  | "SETTLED";
export type HouseholdExpenseShareStatus =
  | "NO_PAYMENT_DUE"
  | "OUTSTANDING"
  | "PARTIALLY_SETTLED"
  | "SETTLED";
export type HouseholdSettlementStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type HouseholdRecurringTemplateStatus = "ACTIVE" | "PAUSED" | "ENDED";
export type HouseholdBudgetCategory =
  | "OVERALL"
  | "RENT"
  | "UTILITIES"
  | "GROCERIES"
  | "MAINTENANCE"
  | "SUBSCRIPTIONS"
  | "OTHER";
export type HouseholdBudgetThreshold = "BELOW" | "EIGHTY" | "ONE_HUNDRED";
export type HouseholdTrendDirection = "UP" | "DOWN" | "FLAT" | "NEW" | "START";
export type HouseholdBillState =
  | "UPCOMING"
  | "DUE_TODAY"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE";

export type HouseholdMemberView = {
  userId: string;
  name: string;
  status: HouseholdMemberStatus;
  isViewer: boolean;
};

export type HouseholdItemView = {
  id: string;
  householdId: string;
  createdById: string;
  assignedToId: string | null;
  kind: HouseholdItemKind;
  title: string;
  detail: string | null;
  amountMinor: number | null;
  dueDate: string | null;
  recurrence: HouseholdRecurrence;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
};

export type HouseholdSettlementView = {
  id: string;
  expenseShareId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  status: HouseholdSettlementStatus;
  note: string | null;
  recordedById: string;
  confirmedById: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type HouseholdExpenseShareView = {
  id: string;
  expenseId: string;
  memberId: string;
  creditorId: string | null;
  shareAmountMinor: number;
  settledAmountMinor: number;
  status: HouseholdExpenseShareStatus;
  settlements: HouseholdSettlementView[];
};

export type HouseholdExpenseView = {
  id: string;
  householdId: string;
  createdById: string;
  paidById: string;
  category: HouseholdExpenseCategory;
  title: string;
  description: string | null;
  amountMinor: number;
  expenseDate: string;
  splitMethod: HouseholdExpenseSplitMethod;
  status: HouseholdExpenseStatus;
  recurringTemplateId: string | null;
  billingCycleStart: string | null;
  dueDate: string | null;
  createdAt: string;
  shares: HouseholdExpenseShareView[];
};

export type HouseholdRecurringParticipantView = {
  id: string;
  templateId: string;
  memberId: string;
  customAmountMinor: number | null;
};

export type HouseholdRecurringTemplateView = {
  id: string;
  householdId: string;
  createdById: string;
  paidById: string;
  category: HouseholdExpenseCategory;
  title: string;
  description: string | null;
  amountMinor: number;
  splitMethod: HouseholdExpenseSplitMethod;
  firstDueDate: string;
  dueDay: number;
  endDate: string | null;
  status: HouseholdRecurringTemplateStatus;
  pausedAt: string | null;
  endedAt: string | null;
  participants: HouseholdRecurringParticipantView[];
};

export type HouseholdMonthlyCategoryTotal = {
  category: HouseholdExpenseCategory;
  amountMinor: number;
  expenseCount: number;
};

export type HouseholdMonthlyLargestExpense = {
  id: string;
  title: string;
  category: HouseholdExpenseCategory;
  amountMinor: number;
  expenseDate: string;
};

export type HouseholdMonthlySpendingSummary = {
  householdId: string;
  month: string;
  expenseCount: number;
  totalExpenseMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  categories: HouseholdMonthlyCategoryTotal[];
  largestExpenses: HouseholdMonthlyLargestExpense[];
  budgets: HouseholdMonthlyBudgetProgress[];
  viewer: {
    shareMinor: number;
    paidMinor: number;
    outstandingMinor: number;
    paidForHouseholdMinor: number;
  };
};

export type HouseholdMonthlyBudgetProgress = {
  id: string;
  category: HouseholdBudgetCategory;
  budgetMinor: number;
  spendMinor: number;
  usagePercent: number;
  threshold: HouseholdBudgetThreshold;
};

export type HouseholdExpenseTrendMonth = {
  month: string;
  totalMinor: number;
  recurringMinor: number;
  oneTimeMinor: number;
  expenseCount: number;
  budgetMinor: number | null;
  budgetUsagePercent: number | null;
  changeMinor: number | null;
  changePercent: number | null;
  direction: HouseholdTrendDirection;
};

export type HouseholdExpenseCategoryChange = {
  category: Exclude<HouseholdBudgetCategory, "OVERALL">;
  currentMinor: number;
  previousMinor: number;
  changeMinor: number;
  changePercent: number | null;
  direction: Exclude<HouseholdTrendDirection, "START">;
};

export type HouseholdExpenseTrends = {
  householdId: string;
  endMonth: string;
  monthCount: 6 | 12;
  months: HouseholdExpenseTrendMonth[];
  categoryChanges: HouseholdExpenseCategoryChange[];
};

export type HouseholdView = {
  id: string;
  finalizedSpaceId: string;
  status: HouseholdStatus;
  title: string;
  subtitle: string;
  archivedAt: string | null;
  members: HouseholdMemberView[];
  items: HouseholdItemView[];
  expenses: HouseholdExpenseView[];
  recurringExpenseTemplates: HouseholdRecurringTemplateView[];
  monthlySpendingSummary: HouseholdMonthlySpendingSummary | null;
  expenseTrends: HouseholdExpenseTrends | null;
};

export type HouseholdPageData = {
  viewerId: string;
  selectedMonth: string;
  households: HouseholdView[];
};

export type HouseholdActionState = {
  success: boolean;
  message: string;
};
