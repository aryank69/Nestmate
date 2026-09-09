"use client";

import { useEffect, useRef } from "react";

import { trackProductAnalyticsAction } from "@/app/analytics/actions";
import type { ProductAnalyticsEventInput } from "@/types/analytics";

export function AnalyticsEventTracker({
  event,
  dedupeKey,
}: {
  event: ProductAnalyticsEventInput;
  dedupeKey: string;
}) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    const storageKey = `nestmate:analytics:${dedupeKey}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Analytics remains best-effort when browser storage is unavailable.
    }
    void trackProductAnalyticsAction(event);
  }, [dedupeKey, event]);

  return null;
}
