"use server";

import { trackProductAnalyticsEvent } from "@/lib/analytics.server";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductAnalyticsEventInput } from "@/types/analytics";

export async function trackProductAnalyticsAction(input: unknown) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (error || !authUserId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { authUserId },
      select: { id: true },
    });
    if (!user) return;

    await trackProductAnalyticsEvent(
      user.id,
      input as ProductAnalyticsEventInput,
    );
  } catch (analyticsError) {
    console.error("[analytics] Client event lookup failed", {
      error:
        analyticsError instanceof Error
          ? analyticsError.message
          : "Unknown error",
    });
  }
}
