import {
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Gauge,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { MoveInReadiness } from "@/types/move-in-readiness";

const levelStyles = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-orange-200 bg-orange-50 text-orange-800",
} as const;

export function MoveInReadinessIndicator({
  value,
  details = false,
  className,
}: {
  value: MoveInReadiness;
  details?: boolean;
  className?: string;
}) {
  if (!details) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
          levelStyles[value.level],
          className,
        )}
        aria-label={`Move-in Readiness: ${value.label}, ${value.score} out of 100`}
      >
        <CalendarCheck2 aria-hidden="true" className="size-3.5" />
        {value.label} · {value.score}
      </div>
    );
  }

  return (
    <section className={cn("rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gauge aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Move-in Readiness
            </p>
            <p className="mt-1 text-sm font-semibold">{value.label}</p>
          </div>
        </div>
        <span className={cn("rounded-full border px-3 py-1.5 text-sm font-bold", levelStyles[value.level])}>
          {value.score}/100
        </span>
      </div>

      {value.reasons.length ? (
        <ul className="mt-4 space-y-2">
          {value.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm leading-5">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {value.considerations.length ? (
        <ul className="mt-3 space-y-2">
          {value.considerations.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm leading-5 text-muted-foreground">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group mt-4 border-t border-border/70 pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-primary outline-none hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/25 [&::-webkit-details-marker]:hidden">
          How readiness is calculated
        </summary>
        <div className="mt-3 space-y-2">
          {value.factors.map((factor) => (
            <div key={factor.key} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
              <div className="text-muted-foreground">
                <p>{factor.label} · {factor.weight}% weight</p>
                <p className="mt-0.5 text-[0.6875rem]">{factor.reason}</p>
              </div>
              <p className="font-semibold text-foreground">
                {Math.round(factor.alignment * 100)}%
              </p>
            </div>
          ))}
          <p className="pt-1 text-[0.6875rem] leading-5 text-muted-foreground">
            Readiness measures how actionable this listing appears right now. It is not Living Fit, a Reality Score, or a guarantee. Only a yes/no open-slot signal and privacy-safe activity labels are used; schedules, bookings, and message details are never shown.
          </p>
        </div>
      </details>
    </section>
  );
}
