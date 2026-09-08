import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ResponsivenessIndicator as ResponsivenessValue } from "@/types/responsiveness";

const levelStyles = {
  quick: "border-emerald-200 bg-emerald-50 text-emerald-800",
  active: "border-sky-200 bg-sky-50 text-sky-800",
  limited: "border-border bg-muted text-muted-foreground",
  neutral: "border-border bg-background text-muted-foreground",
} as const;

export function ResponsivenessIndicator({
  value,
}: {
  value: ResponsivenessValue;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        levelStyles[value.level],
      )}
      title={`${value.description} Exact activity times and message details stay private.`}
    >
      <Activity aria-hidden="true" className="size-3.5" />
      {value.label}
    </span>
  );
}
