import { CheckCircle2, CircleAlert, Sparkles } from "lucide-react";

import type { RecommendationResult } from "@/types/recommendation";

export function RecommendationSummary({
  result,
}: {
  result: RecommendationResult | null;
}) {
  if (!result || result.score === null) return null;

  return (
    <aside className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Living Fit
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {result.label}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">
          {result.score}%
        </span>
      </div>

      {result.reasons.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Why it fits
          </p>
          <ul className="mt-2 space-y-2">
          {result.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm leading-5 text-foreground">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              {reason}
            </li>
          ))}
          </ul>
        </div>
      ) : null}

      {result.considerations.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Things to consider
          </p>
          <ul className="mt-2 space-y-2">
            {result.considerations.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-sm leading-5 text-muted-foreground">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="group mt-4 border-t border-primary/10 pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-primary outline-none hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/25 [&::-webkit-details-marker]:hidden">
          How Living Fit is calculated
        </summary>
        <div className="mt-3 space-y-2">
          {result.factors.map((factor) => (
            <div key={factor.key} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
              <div className="text-muted-foreground">
                <p>{factor.label} · {factor.weight}% weight</p>
                <p className="mt-0.5 text-[0.6875rem]">{factor.reason}</p>
              </div>
              <p className="font-semibold text-foreground">
                {Math.round(factor.alignment * 100)}% fit
              </p>
            </div>
          ))}
          <p className="pt-1 text-[0.6875rem] leading-5 text-muted-foreground">
            Living Fit uses configurable weights and only the privacy-safe signals available to you. Missing details are skipped, not treated as mismatches. It never bypasses your filters, blocks, or visibility rules. No AI is used.
          </p>
          <p className="text-[0.6875rem] leading-5 text-muted-foreground">
            Commute time is a simple distance-based estimate, not a live traffic or route prediction.
          </p>
        </div>
      </details>
    </aside>
  );
}
