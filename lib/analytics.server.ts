import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  calculateProductFunnel,
  sanitizeProductAnalyticsEvent,
} from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import type {
  ProductAnalyticsEventInput,
  ProductAnalyticsEventName,
  ProductAnalyticsFunnel,
  SanitizedProductAnalyticsEvent,
} from "@/types/analytics";

export type ProductAnalyticsProvider = {
  track(input: {
    userId: string;
    event: SanitizedProductAnalyticsEvent;
    occurredAt: Date;
  }): Promise<void>;
};

type AnalyticsRow = {
  userId: string;
  name: ProductAnalyticsEventName;
};

export const databaseProductAnalyticsProvider: ProductAnalyticsProvider = {
  async track({ userId, event, occurredAt }) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO nestmate_private.product_analytics_event
        (user_id, event_name, properties, occurred_at)
      VALUES
        (${userId}, ${event.name}, ${JSON.stringify(event.properties)}::JSONB, ${occurredAt})
      ON CONFLICT DO NOTHING
    `);
  },
};

export async function trackProductAnalyticsEvent(
  userId: string,
  input: ProductAnalyticsEventInput,
  provider: ProductAnalyticsProvider = databaseProductAnalyticsProvider,
) {
  const event = sanitizeProductAnalyticsEvent(input);
  if (!event || !userId) return false;
  try {
    await provider.track({ userId, event, occurredAt: new Date() });
    return true;
  } catch (error) {
    console.error("[analytics] Event write failed", {
      event: event.name,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export async function loadProductAnalyticsFunnel(
  moderatorUserId: string,
  periodDays = 30,
): Promise<ProductAnalyticsFunnel> {
  const membership = await prisma.moderatorMembership.findUnique({
    where: { userId: moderatorUserId },
    select: { userId: true },
  });
  if (!membership) throw new Error("Moderator access is required.");

  const safePeriodDays = Math.min(365, Math.max(1, Math.trunc(periodDays)));
  const since = new Date(Date.now() - safePeriodDays * 86_400_000);
  const rows = await prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
    SELECT user_id AS "userId", event_name AS "name"
    FROM nestmate_private.product_analytics_event
    WHERE occurred_at >= ${since}
    ORDER BY occurred_at ASC
  `);
  return calculateProductFunnel(rows, safePeriodDays);
}
