"use server";

import { revalidatePath } from "next/cache";

import {
  cleanHouseholdText,
  householdAmountMinor,
  isHouseholdBudgetCategory,
  isHouseholdExpenseCategory,
  isHouseholdItemKind,
  isHouseholdRecurrence,
  isHouseholdSplitMethod,
  splitExpenseAmountMinor,
} from "@/lib/household";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HouseholdActionState } from "@/types/household";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const USER_ID = /^[a-zA-Z0-9_-]{10,64}$/;

type RecurringExpenseInput = {
  householdId: string;
  paidById: string;
  category: string;
  title: string;
  description?: string;
  amountRupees: string | number;
  firstDueDate: string;
  endDate?: string;
  splitMethod: string;
  memberIds: string[];
  customAmountsRupees?: Record<string, string | number>;
};

function parseRecurringExpenseInput(input: RecurringExpenseInput) {
  const title = cleanHouseholdText(input.title, 120);
  const description = cleanHouseholdText(input.description ?? "", 500);
  const totalMinor = householdAmountMinor(input.amountRupees);
  const memberIds = [...new Set(input.memberIds.filter((id) => USER_ID.test(id)))];
  const endDate = input.endDate?.trim() || null;
  if (
    !UUID.test(input.householdId) ||
    !USER_ID.test(input.paidById) ||
    !isHouseholdExpenseCategory(input.category) ||
    !isHouseholdSplitMethod(input.splitMethod) ||
    !title ||
    totalMinor === null ||
    totalMinor === undefined ||
    !DATE.test(input.firstDueDate) ||
    (endDate !== null && (!DATE.test(endDate) || endDate < input.firstDueDate)) ||
    memberIds.length !== input.memberIds.length ||
    !memberIds.length
  ) return null;

  const customAmountsMinor: Record<string, number> = {};
  if (input.splitMethod === "CUSTOM") {
    for (const memberId of memberIds) {
      const amount = householdAmountMinor(input.customAmountsRupees?.[memberId]);
      if (amount === null || amount === undefined) return null;
      customAmountsMinor[memberId] = amount;
    }
  }
  const shares = splitExpenseAmountMinor({
    totalMinor,
    memberIds,
    method: input.splitMethod,
    customAmountsMinor,
  });
  if (!shares) return null;
  return {
    p_paid_by_id: input.paidById,
    p_category: input.category,
    p_title: title,
    p_description: description,
    p_amount_minor: totalMinor,
    p_first_due_date: input.firstDueDate,
    p_end_date: endDate,
    p_split_method: input.splitMethod,
    p_member_ids: memberIds,
    p_custom_share_amounts:
      input.splitMethod === "CUSTOM"
        ? shares.map(({ amountMinor }) => amountMinor)
        : null,
  };
}

async function householdContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  return { supabase, userId: user.id };
}

export async function createHouseholdItemAction(input: {
  householdId: string;
  kind: string;
  title: string;
  detail?: string;
  amountRupees?: string | number;
  dueDate?: string;
  recurrence: string;
  assignedToId?: string;
}): Promise<HouseholdActionState> {
  const title = cleanHouseholdText(input.title, 120);
  const detail = cleanHouseholdText(input.detail ?? "", 500);
  const amountMinor = householdAmountMinor(input.amountRupees);
  const financial = input.kind === "RENT_DUE" || input.kind === "EXPENSE";
  const assignedToId = cleanHouseholdText(input.assignedToId ?? "", 64);
  const dueDate = input.dueDate?.trim() || null;
  if (
    !UUID.test(input.householdId) ||
    !isHouseholdItemKind(input.kind) ||
    !isHouseholdRecurrence(input.recurrence) ||
    !title ||
    amountMinor === undefined ||
    (!financial && amountMinor !== null) ||
    (dueDate !== null && !DATE.test(dueDate))
  ) {
    return { success: false, message: "Check the title, date, recurrence, and optional amount." };
  }

  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to update your household." };
  const { error } = await context.supabase.from("HouseholdItem").insert({
    householdId: input.householdId,
    kind: input.kind,
    title,
    detail,
    amountMinor: financial ? amountMinor : null,
    dueDate,
    recurrence: input.recurrence,
    assignedToId,
    isCompleted: false,
  });
  if (error) {
    console.error("[household:create-item] Insert failed", { code: error.code, message: error.message });
    return { success: false, message: "This item could not be added. The household may be archived or private." };
  }
  revalidatePath("/household");
  return { success: true, message: "Household item added privately." };
}

export async function setHouseholdMonthlyBudgetAction(input: {
  householdId: string;
  month: string;
  category: string;
  amountRupees: string | number | null;
}): Promise<HouseholdActionState> {
  const amountMinor = householdAmountMinor(input.amountRupees);
  if (
    !UUID.test(input.householdId) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) ||
    !isHouseholdBudgetCategory(input.category) ||
    amountMinor === undefined
  ) {
    return { success: false, message: "Choose a valid month, category, and budget amount." };
  }

  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to manage household budgets." };
  const { data, error } = await context.supabase.rpc("set_household_monthly_budget", {
    p_household_id: input.householdId,
    p_month: `${input.month}-01`,
    p_category: input.category,
    p_amount_minor: amountMinor,
  });
  if (error || data !== true) {
    console.error("[household:set-budget] RPC failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message: "This budget could not be updated. The household may be archived or private.",
    };
  }
  revalidatePath("/household");
  return {
    success: true,
    message: amountMinor === null ? "Monthly budget removed." : "Monthly budget updated.",
  };
}

export async function createSharedExpenseAction(input: {
  householdId: string;
  paidById: string;
  category: string;
  title: string;
  description?: string;
  amountRupees: string | number;
  expenseDate: string;
  splitMethod: string;
  memberIds: string[];
  customAmountsRupees?: Record<string, string | number>;
}): Promise<HouseholdActionState> {
  const title = cleanHouseholdText(input.title, 120);
  const description = cleanHouseholdText(input.description ?? "", 500);
  const totalMinor = householdAmountMinor(input.amountRupees);
  const memberIds = [...new Set(input.memberIds.filter((id) => USER_ID.test(id)))];
  if (
    !UUID.test(input.householdId) ||
    !USER_ID.test(input.paidById) ||
    !isHouseholdExpenseCategory(input.category) ||
    !isHouseholdSplitMethod(input.splitMethod) ||
    !title ||
    totalMinor === null ||
    totalMinor === undefined ||
    !DATE.test(input.expenseDate) ||
    memberIds.length !== input.memberIds.length ||
    !memberIds.length
  ) {
    return { success: false, message: "Check the expense, amount, date, and selected members." };
  }

  const customAmountsMinor: Record<string, number> = {};
  if (input.splitMethod === "CUSTOM") {
    for (const memberId of memberIds) {
      const amount = householdAmountMinor(input.customAmountsRupees?.[memberId]);
      if (amount === null || amount === undefined) {
        return { success: false, message: "Enter a positive custom share for every selected member." };
      }
      customAmountsMinor[memberId] = amount;
    }
  }
  const shares = splitExpenseAmountMinor({
    totalMinor,
    memberIds,
    method: input.splitMethod,
    customAmountsMinor,
  });
  if (!shares) {
    return { success: false, message: "Custom shares must add up exactly to the expense total." };
  }

  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to add a shared expense." };
  const { error } = await context.supabase.rpc("create_household_expense", {
    p_household_id: input.householdId,
    p_paid_by_id: input.paidById,
    p_category: input.category,
    p_title: title,
    p_description: description,
    p_amount_minor: totalMinor,
    p_expense_date: input.expenseDate,
    p_split_method: input.splitMethod,
    p_member_ids: memberIds,
    p_custom_share_amounts:
      input.splitMethod === "CUSTOM"
        ? shares.map(({ amountMinor }) => amountMinor)
        : null,
  });
  if (error) {
    console.error("[household:create-expense] RPC failed", {
      code: error.code,
      message: error.message,
    });
    return { success: false, message: "The expense could not be added. Check that the household and members are still active." };
  }
  revalidatePath("/household");
  return { success: true, message: "Shared expense added privately." };
}

export async function deleteSharedExpenseAction(input: {
  householdId: string;
  expenseId: string;
}): Promise<HouseholdActionState> {
  if (!UUID.test(input.householdId) || !UUID.test(input.expenseId)) {
    return { success: false, message: "Choose a valid expense." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to remove an expense." };
  const { data, error } = await context.supabase.rpc("delete_household_expense", {
    p_expense_id: input.expenseId,
  });
  if (error || data !== true) {
    return { success: false, message: "Only the creator can remove an active expense with no settlement history." };
  }
  revalidatePath("/household");
  return { success: true, message: "Shared expense removed." };
}

export async function createRecurringExpenseAction(
  input: RecurringExpenseInput,
): Promise<HouseholdActionState> {
  const parsed = parseRecurringExpenseInput(input);
  if (!parsed) {
    return { success: false, message: "Check the recurring bill, due date, participants, and split total." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to add a recurring bill." };
  const { error } = await context.supabase.rpc("create_recurring_household_expense", {
    p_household_id: input.householdId,
    ...parsed,
  });
  if (error) {
    console.error("[household:create-recurring] RPC failed", {
      code: error.code,
      message: error.message,
    });
    return { success: false, message: "The recurring bill could not be created. Check that all participants are active." };
  }
  revalidatePath("/household");
  return { success: true, message: "Monthly recurring bill created." };
}

export async function updateRecurringExpenseAction(
  input: RecurringExpenseInput & { templateId: string },
): Promise<HouseholdActionState> {
  const parsed = parseRecurringExpenseInput(input);
  if (!UUID.test(input.templateId) || !parsed) {
    return { success: false, message: "Check the recurring bill, due date, participants, and split total." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to edit a recurring bill." };
  const { data, error } = await context.supabase.rpc("update_recurring_household_expense", {
    p_template_id: input.templateId,
    ...parsed,
  });
  if (error || data !== true) {
    return { success: false, message: "This recurring bill could not be edited. Ended templates remain read-only." };
  }
  revalidatePath("/household");
  return { success: true, message: "Recurring bill updated for future cycles. Existing expenses were preserved." };
}

export async function setRecurringExpenseStatusAction(input: {
  householdId: string;
  templateId: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
}): Promise<HouseholdActionState> {
  if (
    !UUID.test(input.householdId) ||
    !UUID.test(input.templateId) ||
    !["ACTIVE", "PAUSED", "ENDED"].includes(input.status)
  ) {
    return { success: false, message: "Choose a valid recurring bill action." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to manage recurring bills." };
  const { data, error } = await context.supabase.rpc(
    "set_recurring_household_expense_status",
    { p_template_id: input.templateId, p_status: input.status },
  );
  if (error || data !== true) {
    return { success: false, message: "This recurring bill could not be changed. Ended templates cannot be restarted." };
  }
  revalidatePath("/household");
  return {
    success: true,
    message:
      input.status === "ACTIVE"
        ? "Recurring bill resumed."
        : input.status === "PAUSED"
          ? "Recurring bill paused."
          : "Recurring bill ended. Previous expenses remain in the ledger.",
  };
}

export async function recordSettlementAction(input: {
  householdId: string;
  expenseShareId: string;
  amountRupees: string | number;
  note?: string;
}): Promise<HouseholdActionState> {
  const amountMinor = householdAmountMinor(input.amountRupees);
  const note = cleanHouseholdText(input.note ?? "", 240);
  if (
    !UUID.test(input.householdId) ||
    !UUID.test(input.expenseShareId) ||
    amountMinor === null ||
    amountMinor === undefined
  ) {
    return { success: false, message: "Enter a valid settlement amount." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to record a settlement." };
  const { error } = await context.supabase.rpc("record_household_settlement", {
    p_expense_share_id: input.expenseShareId,
    p_amount_minor: amountMinor,
    p_note: note,
  });
  if (error) {
    console.error("[household:record-settlement] RPC failed", {
      code: error.code,
      message: error.message,
    });
    return { success: false, message: "This settlement could not be recorded. Check the remaining balance or household access." };
  }
  revalidatePath("/household");
  return { success: true, message: "Settlement recorded and awaiting the other member’s confirmation." };
}

export async function setSettlementStatusAction(input: {
  householdId: string;
  settlementId: string;
  status: "CONFIRMED" | "CANCELLED";
}): Promise<HouseholdActionState> {
  if (
    !UUID.test(input.householdId) ||
    !UUID.test(input.settlementId) ||
    !["CONFIRMED", "CANCELLED"].includes(input.status)
  ) {
    return { success: false, message: "Choose a valid pending settlement." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to update a settlement." };
  const { data, error } = await context.supabase.rpc("set_household_settlement_status", {
    p_settlement_id: input.settlementId,
    p_status: input.status,
  });
  if (error || data !== true) {
    return {
      success: false,
      message:
        input.status === "CONFIRMED"
          ? "Only the other involved member can confirm a pending settlement."
          : "This pending settlement could not be cancelled.",
    };
  }
  revalidatePath("/household");
  return {
    success: true,
    message: input.status === "CONFIRMED" ? "Settlement confirmed." : "Settlement cancelled.",
  };
}

export async function setHouseholdItemCompletedAction(input: {
  householdId: string;
  itemId: string;
  completed: boolean;
}): Promise<HouseholdActionState> {
  if (!UUID.test(input.householdId) || !UUID.test(input.itemId) || typeof input.completed !== "boolean") {
    return { success: false, message: "Choose a valid household item." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to update your household." };
  const { data, error } = await context.supabase
    .from("HouseholdItem")
    .update({ isCompleted: input.completed })
    .eq("id", input.itemId)
    .eq("householdId", input.householdId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, message: "This item could not be updated. The household may be archived." };
  }
  revalidatePath("/household");
  return { success: true, message: input.completed ? "Marked complete." : "Moved back to open." };
}

export async function deleteHouseholdItemAction(input: {
  householdId: string;
  itemId: string;
}): Promise<HouseholdActionState> {
  if (!UUID.test(input.householdId) || !UUID.test(input.itemId)) {
    return { success: false, message: "Choose a valid household item." };
  }
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to update your household." };
  const { error, count } = await context.supabase
    .from("HouseholdItem")
    .delete({ count: "exact" })
    .eq("id", input.itemId)
    .eq("householdId", input.householdId)
    .eq("createdById", context.userId);
  if (error || count !== 1) return { success: false, message: "Only the creator can remove an item from an active household." };
  revalidatePath("/household");
  return { success: true, message: "Household item removed." };
}

export async function archiveHouseholdAction(householdId: string): Promise<HouseholdActionState> {
  if (!UUID.test(householdId)) return { success: false, message: "Choose a valid household." };
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to archive your household." };
  const { data, error } = await context.supabase
    .from("Household")
    .update({ status: "ARCHIVED" })
    .eq("id", householdId)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle();
  if (error || !data) return { success: false, message: "This household could not be archived." };
  revalidatePath("/household");
  return { success: true, message: "Household archived as read-only for its active members." };
}

export async function leaveHouseholdAction(householdId: string): Promise<HouseholdActionState> {
  if (!UUID.test(householdId)) return { success: false, message: "Choose a valid household." };
  const context = await householdContext();
  if (!context) return { success: false, message: "Please log in to leave your household." };
  const { error, count } = await context.supabase
    .from("HouseholdMember")
    .update({ status: "LEFT" }, { count: "exact" })
    .eq("householdId", householdId)
    .eq("userId", context.userId)
    .eq("status", "ACTIVE");
  if (error || count !== 1) return { success: false, message: "You could not leave this household." };
  revalidatePath("/household");
  return { success: true, message: "You left the household and no longer have access to its private data." };
}
