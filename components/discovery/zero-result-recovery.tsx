import Link from "next/link";
import { ArrowRight, SlidersHorizontal, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ZeroResultSuggestion } from "@/types/discovery";

export function ZeroResultRecovery({
  suggestions,
  resultLabel,
}: {
  suggestions: ZeroResultSuggestion[];
  resultLabel: string;
}) {
  if (!suggestions.length) return null;

  return (
    <section className="mt-7 text-left" aria-labelledby="recovery-heading">
      <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h3 id="recovery-heading" className="text-base font-bold text-foreground">
              A few nearby options may work
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Nothing has changed yet. Choose a suggestion to apply only the criterion shown.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {suggestions.map((suggestion) => (
            <article
              key={suggestion.id}
              className="flex flex-col rounded-2xl border border-border/80 bg-card p-4 shadow-sm shadow-foreground/[0.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    {suggestion.title}
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {suggestion.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[0.6875rem] font-bold text-secondary-foreground">
                  {suggestion.resultCount} {resultLabel}
                  {suggestion.resultCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 space-y-1.5">
                <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <SlidersHorizontal aria-hidden="true" className="size-3" />
                  Criteria relaxed
                </p>
                {suggestion.relaxedCriteria.map((criterion) => (
                  <p
                    key={criterion}
                    className="rounded-lg border border-border/70 bg-muted/35 px-2.5 py-2 text-xs font-medium text-foreground"
                  >
                    {criterion}
                  </p>
                ))}
              </div>

              <Link
                href={suggestion.href}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-4 w-full",
                )}
              >
                Apply this change
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
