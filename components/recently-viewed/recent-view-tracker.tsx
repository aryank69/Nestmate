"use client";

import { useEffect } from "react";

import { recordRecentViewAction } from "@/app/recently-viewed/actions";
import type { RecentViewTargetType } from "@/types/recently-viewed";

export function RecentViewTracker({
  targetType,
  targetId,
}: {
  targetType: RecentViewTargetType;
  targetId: string;
}) {
  useEffect(() => {
    void recordRecentViewAction({ targetType, targetId });
  }, [targetId, targetType]);

  return null;
}
