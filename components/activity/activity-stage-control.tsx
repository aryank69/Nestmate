"use client";

import { LoaderCircle, Waypoints } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setActivityStageAction } from "@/app/activity/actions";
import {
  INTEREST_STAGE_LABELS,
  INTEREST_STAGES,
} from "@/lib/activity";
import { cn } from "@/lib/utils";
import type { InterestStage, InterestTargetType } from "@/types/activity";

export function ActivityStageControl({
  targetType,
  targetId,
  initialStage,
  compact = false,
  className,
}: {
  targetType: InterestTargetType;
  targetId: string;
  initialStage: InterestStage | null;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<InterestStage | "">(initialStage ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const updateStage = (nextStage: InterestStage) => {
    const previous = stage;
    setStage(nextStage);
    setError("");
    startTransition(async () => {
      const result = await setActivityStageAction({
        targetType,
        targetId,
        stage: nextStage,
      });
      if (!result.success) {
        setStage(previous);
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={cn("min-w-0", className)}>
      <label className="relative flex items-center">
        <span className="sr-only">Interest stage</span>
        {isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="pointer-events-none absolute left-3 size-4 animate-spin text-primary"
          />
        ) : (
          <Waypoints
            aria-hidden="true"
            className="pointer-events-none absolute left-3 size-4 text-primary"
          />
        )}
        <select
          value={stage}
          disabled={isPending}
          onChange={(event) => updateStage(event.target.value as InterestStage)}
          className={cn(
            "h-10 w-full appearance-none rounded-xl border border-border bg-background pl-9 pr-8 text-sm font-semibold text-foreground outline-none transition hover:border-primary/35 focus:border-primary focus:ring-3 focus:ring-primary/15 disabled:cursor-wait disabled:opacity-70",
            compact && "h-9 text-xs",
          )}
        >
          <option value="" disabled>
            Track interest
          </option>
          {INTEREST_STAGES.map((option) => (
            <option key={option} value={option}>
              {INTEREST_STAGE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="mt-1.5 max-w-64 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
