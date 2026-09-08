"use client";

import { Check, CircleAlert, Scale, UsersRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PeopleCard } from "@/components/people/people-discovery";
import { buttonVariants } from "@/components/ui/button";
import { MAX_COMPARISON_LISTINGS } from "@/lib/comparison";
import { cn } from "@/lib/utils";
import type { ShortlistedProfileView } from "@/types/shortlist";

export function FlatmateShortlist({
  profiles,
  unavailableCount,
  error,
}: {
  profiles: ShortlistedProfileView[];
  unavailableCount: number;
  error: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const availableIds = useMemo(
    () => new Set(profiles.map(({ profile }) => profile.id)),
    [profiles],
  );
  const selected = selectedIds.filter((id) => availableIds.has(id));
  const comparisonHref = `/shortlist/compare?ids=${encodeURIComponent(selected.join(","))}`;

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_COMPARISON_LISTINGS) return current;
      return [...current, id];
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <UsersRound aria-hidden="true" className="size-4" />
            Flatmate shortlist
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
            People worth another look
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Keep compatible profiles together, then compare up to four using the details people have chosen to share.
          </p>
        </div>
        {selected.length ? (
          <Link href={comparisonHref} className={cn(buttonVariants(), "shrink-0")}>
            <Scale aria-hidden="true" className="size-4" />
            Compare {selected.length}
          </Link>
        ) : (
          <span className={cn(buttonVariants(), "pointer-events-none shrink-0 opacity-50")} aria-disabled="true">
            <Scale aria-hidden="true" className="size-4" />
            Select to compare
          </span>
        )}
      </header>

      {error ? (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {unavailableCount ? (
        <p className="mt-4 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {unavailableCount} shortlisted {unavailableCount === 1 ? "profile is" : "profiles are"} hidden because of privacy, blocking, or availability changes.
        </p>
      ) : null}

      {profiles.length ? (
        <>
          <div className="sticky top-20 z-20 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-sm font-semibold">
              {selected.length}/{MAX_COMPARISON_LISTINGS} selected
            </p>
            <p className="text-xs text-muted-foreground">
              Choose profiles below to compare them side by side.
            </p>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {profiles.map(({ profile, shortlistedAt }) => {
              const isSelected = selected.includes(profile.id);
              const atLimit = selected.length >= MAX_COMPARISON_LISTINGS;
              return (
                <div key={profile.id} className="space-y-2">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!isSelected && atLimit}
                    onClick={() => toggleSelected(profile.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
                      isSelected
                        ? "border-primary/40 bg-primary/8 text-primary"
                        : "border-border/80 bg-card hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45",
                    )}
                  >
                    <span>{isSelected ? "Selected for comparison" : "Select for comparison"}</span>
                    <span className={cn("flex size-5 items-center justify-center rounded-full border", isSelected && "border-primary bg-primary text-primary-foreground")}>
                      {isSelected ? <Check aria-hidden="true" className="size-3" /> : null}
                    </span>
                  </button>
                  <PeopleCard profile={profile} />
                  <p className="px-1 text-xs text-muted-foreground">Shortlisted {shortlistedAt}</p>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="surface-card mt-8 flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UsersRound aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">No flatmates shortlisted yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Explore compatible people and use Shortlist to keep promising profiles here.
          </p>
          <Link href="/flatmates" className={cn(buttonVariants(), "mt-5")}>Find flatmates</Link>
        </div>
      )}
    </div>
  );
}
