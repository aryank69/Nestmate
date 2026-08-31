import { CheckCircle2, CircleAlert, Gauge, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CompatibilityResult } from "@/types/compatibility";

function scoreClassName(score: number) {
  if (score >= 70) return "bg-secondary text-secondary-foreground";
  if (score >= 50) return "bg-accent text-accent-foreground";
  return "bg-muted text-foreground";
}

export function CompatibilitySummary({
  result,
}: {
  result: CompatibilityResult;
}) {
  if (result.score === null) {
    return null;
  }

  return (
    <section
      aria-label={`Compatibility score: ${result.score} out of 100`}
      className="mt-5 rounded-2xl border border-border/70 bg-muted/35 p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl shadow-xs",
            scoreClassName(result.score),
          )}
        >
          <span className="text-lg font-bold leading-none">{result.score}</span>
          <span className="mt-0.5 text-[0.625rem] font-bold uppercase tracking-wide">
            / 100
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Gauge aria-hidden="true" className="size-4 text-primary" />
            {result.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Compared {result.comparedFactors} of {result.totalFactors} profile
            preferences
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-secondary bg-secondary/35 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-secondary-foreground">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            Main matches
          </p>
          {result.mainMatches.length ? (
            <ul className="mt-2 space-y-1.5">
              {result.mainMatches.map((factor) => (
                <li
                  key={factor.key}
                  className="text-xs leading-5 text-foreground"
                >
                  {factor.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              No strong preference matches yet.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-background/75 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <CircleAlert
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
            Worth discussing
          </p>
          {result.mainMismatches.length ? (
            <ul className="mt-2 space-y-1.5">
              {result.mainMismatches.map((factor) => (
                <li
                  key={factor.key}
                  className="text-xs leading-5 text-muted-foreground"
                >
                  {factor.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              No major differences in the details compared.
            </p>
          )}
        </div>
      </div>

      <details className="group mt-3 border-t border-border/70 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 [&::-webkit-details-marker]:hidden">
          <Info aria-hidden="true" className="size-3.5" />
          See weighted score breakdown
        </summary>
        <div className="mt-3 space-y-2">
          {result.factors.map((factor) => (
            <div
              key={factor.key}
              className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"
            >
              <div>
                <p className="font-semibold text-foreground">
                  {factor.label}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {factor.detail}
                </p>
              </div>
              <p className="text-right font-medium text-muted-foreground">
                {Math.round(factor.alignment * 100)}% aligned
                <span className="block text-[0.6875rem]">
                  {factor.weight}% weight
                </span>
              </p>
            </div>
          ))}
          <p className="flex gap-1.5 rounded-lg bg-background px-3 py-2 text-[0.6875rem] leading-4 text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            Missing preferences are excluded, and the available weighted points
            are normalized to a 0–100 score. This is a transparent preference
            comparison, not an AI prediction.
          </p>
        </div>
      </details>
    </section>
  );
}
