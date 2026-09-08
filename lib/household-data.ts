import "server-only";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  HouseholdExpenseShareView,
  HouseholdExpenseView,
  HouseholdItemView,
  HouseholdMemberStatus,
  HouseholdMonthlySpendingSummary,
  HouseholdExpenseTrends,
  HouseholdPageData,
  HouseholdStatus,
  HouseholdView,
  HouseholdRecurringParticipantView,
  HouseholdRecurringTemplateView,
} from "@/types/household";

type HouseholdRow = {
  id: string;
  finalizedSpaceId: string;
  status: HouseholdStatus;
  archivedAt: string | null;
  updatedAt: string;
};

type MemberRow = {
  householdId: string;
  userId: string;
  status: HouseholdMemberStatus;
};

type ItemRow = HouseholdItemView;
type ExpenseRow = Omit<HouseholdExpenseView, "shares">;
type ShareRow = Omit<HouseholdExpenseShareView, "settlements">;
type RecurringTemplateRow = Omit<HouseholdRecurringTemplateView, "participants">;
type RecurringParticipantRow = HouseholdRecurringParticipantView;

export async function loadHouseholds(
  authUserId: string,
  selectedMonth: string,
): Promise<HouseholdPageData | null> {
  const viewer = await prisma.user.findFirst({
    where: {
      authUserId,
      moderationState: { isNot: { status: "SUSPENDED" } },
    },
    select: { id: true },
  });
  if (!viewer) return null;

  const supabase = await createSupabaseServerClient();
  const generationResult = await supabase.rpc(
    "generate_my_household_recurring_expenses",
  );
  if (generationResult.error) {
    console.error("[household:recurring-catch-up] Generation unavailable", {
      code: generationResult.error.code,
      message: generationResult.error.message,
    });
  }
  const { data: rawHouseholds, error: householdError } = await supabase
    .from("Household")
    .select("id,finalizedSpaceId,status,archivedAt,updatedAt")
    .order("updatedAt", { ascending: false })
    .limit(50);
  if (householdError) {
    console.error("[household:list] Households unavailable", {
      code: householdError.code,
      message: householdError.message,
    });
    return { viewerId: viewer.id, selectedMonth, households: [] };
  }

  const householdRows = (rawHouseholds ?? []) as HouseholdRow[];
  if (!householdRows.length) {
    return { viewerId: viewer.id, selectedMonth, households: [] };
  }
  const householdIds = householdRows.map(({ id }) => id);

  const [membersResult, itemsResult, expensesResult, templatesResult, spaces] = await Promise.all([
    supabase
      .from("HouseholdMember")
      .select("householdId,userId,status")
      .in("householdId", householdIds)
      .limit(200),
    supabase
      .from("HouseholdItem")
      .select(
        "id,householdId,createdById,assignedToId,kind,title,detail,amountMinor,dueDate,recurrence,isCompleted,completedAt,createdAt",
      )
      .in("householdId", householdIds)
      .order("isCompleted", { ascending: true })
      .order("dueDate", { ascending: true, nullsFirst: false })
      .order("createdAt", { ascending: false })
      .limit(1000),
    supabase
      .from("HouseholdExpense")
      .select(
        "id,householdId,createdById,paidById,category,title,description,amountMinor,expenseDate,splitMethod,status,recurringTemplateId,billingCycleStart,dueDate,createdAt",
      )
      .in("householdId", householdIds)
      .order("expenseDate", { ascending: false })
      .order("createdAt", { ascending: false })
      .limit(500),
    supabase
      .from("HouseholdRecurringExpenseTemplate")
      .select(
        "id,householdId,createdById,paidById,category,title,description,amountMinor,splitMethod,firstDueDate,dueDay,endDate,status,pausedAt,endedAt",
      )
      .in("householdId", householdIds)
      .order("status", { ascending: true })
      .order("firstDueDate", { ascending: true })
      .limit(250),
    prisma.finalizedDocumentSpace.findMany({
      where: { id: { in: householdRows.map(({ finalizedSpaceId }) => finalizedSpaceId) } },
      select: {
        id: true,
        targetType: true,
        post: {
          select: {
            title: true,
            community: {
              select: {
                locality: {
                  select: { name: true, city: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  if (membersResult.error || itemsResult.error || expensesResult.error || templatesResult.error) {
    console.error("[household:list] Private household data unavailable", {
      memberCode: membersResult.error?.code,
      itemCode: itemsResult.error?.code,
      expenseCode: expensesResult.error?.code,
      recurringCode: templatesResult.error?.code,
    });
  }

  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const itemRows = (itemsResult.data ?? []) as ItemRow[];
  const expenseRows = (expensesResult.data ?? []) as ExpenseRow[];
  const templateRows = (templatesResult.data ?? []) as RecurringTemplateRow[];
  const templateIds = templateRows.map(({ id }) => id);
  const participantsResult = templateIds.length
    ? await supabase
        .from("HouseholdRecurringExpenseParticipant")
        .select("id,templateId,memberId,customAmountMinor")
        .in("templateId", templateIds)
        .order("createdAt", { ascending: true })
        .limit(1000)
    : { data: [], error: null };
  if (participantsResult.error) {
    console.error("[household:list] Recurring participants unavailable", {
      code: participantsResult.error.code,
    });
  }
  const recurringParticipants = (participantsResult.data ?? []) as RecurringParticipantRow[];
  const expenseIds = expenseRows.map(({ id }) => id);
  const sharesResult = expenseIds.length
    ? await supabase
        .from("HouseholdExpenseShare")
        .select(
          "id,expenseId,memberId,creditorId,shareAmountMinor,settledAmountMinor,status",
        )
        .in("expenseId", expenseIds)
        .limit(2000)
    : { data: [], error: null };
  const shareRows = (sharesResult.data ?? []) as ShareRow[];
  const shareIds = shareRows.map(({ id }) => id);
  const settlementsResult = shareIds.length
    ? await supabase
        .from("HouseholdSettlement")
        .select(
          "id,expenseShareId,fromUserId,toUserId,amountMinor,status,note,recordedById,confirmedById,confirmedAt,cancelledAt,createdAt",
        )
        .in("expenseShareId", shareIds)
        .order("createdAt", { ascending: false })
        .limit(3000)
    : { data: [], error: null };
  if (sharesResult.error || settlementsResult.error) {
    console.error("[household:list] Private expense ledger unavailable", {
      shareCode: sharesResult.error?.code,
      settlementCode: settlementsResult.error?.code,
    });
  }
  const settlementRows = settlementsResult.data ?? [];
  const userIds = [...new Set(memberRows.map(({ userId }) => userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const summaryAndTrendEntries = await Promise.all(
    householdRows.map(async (household) => {
      const [summaryResult, trendResult] = await Promise.all([
        supabase.rpc("get_household_monthly_spending_summary", {
          p_household_id: household.id,
          p_month: `${selectedMonth}-01`,
        }),
        supabase.rpc("get_household_expense_trends", {
          p_household_id: household.id,
          p_end_month: `${selectedMonth}-01`,
          p_month_count: 12,
        }),
      ]);
      if (summaryResult.error) {
        console.error("[household:monthly-summary] Summary unavailable", {
          code: summaryResult.error.code,
          householdId: household.id,
        });
      }
      if (trendResult.error) {
        console.error("[household:expense-trends] Trends unavailable", {
          code: trendResult.error.code,
          householdId: household.id,
        });
      }
      return [
        household.id,
        {
          summary: summaryResult.error
            ? null
            : summaryResult.data as HouseholdMonthlySpendingSummary,
          trends: trendResult.error
            ? null
            : trendResult.data as HouseholdExpenseTrends,
        },
      ] as const;
    }),
  );
  const summaryAndTrendsByHouseholdId = new Map(summaryAndTrendEntries);

  const households = householdRows.flatMap<HouseholdView>((household) => {
    const space = spaceById.get(household.finalizedSpaceId);
    if (!space) return [];
    const members = memberRows
      .filter((member) => member.householdId === household.id)
      .flatMap((member) => {
        const user = userById.get(member.userId);
        return user
          ? [{
              userId: member.userId,
              name: user.name,
              status: member.status,
              isViewer: member.userId === viewer.id,
            }]
          : [];
      });
    const counterpart = members.find(({ isViewer }) => !isViewer)?.name ?? "Roommate";
    const locality = space.post?.community.locality;
    return [{
      id: household.id,
      finalizedSpaceId: household.finalizedSpaceId,
      status: household.status,
      title: space.post?.title ?? `Household with ${counterpart}`,
      subtitle: locality
        ? `${locality.name}, ${locality.city.name} · with ${counterpart}`
        : `Private household · with ${counterpart}`,
      archivedAt: household.archivedAt,
      members,
      items: itemRows.filter((item) => item.householdId === household.id),
      expenses: expenseRows
        .filter((expense) => expense.householdId === household.id)
        .map((expense) => ({
          ...expense,
          shares: shareRows
            .filter((share) => share.expenseId === expense.id)
            .map((share) => ({
              ...share,
              settlements: settlementRows.filter(
                (settlement) => settlement.expenseShareId === share.id,
              ),
            })),
        })),
      recurringExpenseTemplates: templateRows
        .filter((template) => template.householdId === household.id)
        .map((template) => ({
          ...template,
          participants: recurringParticipants.filter(
            (participant) => participant.templateId === template.id,
          ),
        })),
      monthlySpendingSummary:
        summaryAndTrendsByHouseholdId.get(household.id)?.summary ?? null,
      expenseTrends:
        summaryAndTrendsByHouseholdId.get(household.id)?.trends ?? null,
    }];
  });

  return { viewerId: viewer.id, selectedMonth, households };
}
