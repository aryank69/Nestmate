"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  GitCompareArrows,
  IndianRupee,
  MapPin,
} from "lucide-react";

import { SavePostButton } from "@/components/saved/saved-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_COMPARISON_LISTINGS } from "@/lib/comparison";
import { cn } from "@/lib/utils";
import type { SavedPostView } from "@/types/saved";

export function SavedPostGrid({ posts }: { posts: SavedPostView[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const eligibleIds = new Set(
    posts.filter((post) => post.comparisonEligible).map((post) => post.id),
  );
  const activeSelection = selected.filter((id) => eligibleIds.has(id));
  const compareHref = `/saved/compare?ids=${encodeURIComponent(activeSelection.join(","))}`;

  const toggle = (postId: string) => {
    setMessage("");
    if (activeSelection.includes(postId)) {
      setSelected(activeSelection.filter((id) => id !== postId));
      return;
    }
    if (activeSelection.length >= MAX_COMPARISON_LISTINGS) {
      setMessage(`You can compare up to ${MAX_COMPARISON_LISTINGS} listings at a time.`);
      return;
    }
    setSelected([...activeSelection, postId]);
  };

  return (
    <>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GitCompareArrows aria-hidden="true" className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Compare saved housing</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Select 2–4 Room Available or PG Available listings.
            </p>
            {message ? <p role="status" className="mt-1 text-xs font-semibold text-amber-700">{message}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {activeSelection.length}/{MAX_COMPARISON_LISTINGS} selected
          </span>
          {activeSelection.length >= 2 ? (
            <Link href={compareHref} className={buttonVariants({ size: "sm" })}>
              Compare now <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          ) : (
            <Button type="button" size="sm" disabled>
              Compare now
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {posts.map((post) => {
          const isSelected = activeSelection.includes(post.id);
          const atLimit = activeSelection.length >= MAX_COMPARISON_LISTINGS;
          return (
            <article key={post.id} className={cn("surface-card flex flex-col p-5 transition-shadow", isSelected && "ring-2 ring-primary/30")}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">{post.category}</p>
                  <h3 className="mt-1 text-lg font-semibold leading-6">{post.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Posted by {post.authorName}</p>
                </div>
                <SavePostButton postId={post.id} initialSaved refreshOnChange />
              </div>

              {post.comparisonEligible ? (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!isSelected && atLimit}
                  onClick={() => toggle(post.id)}
                  className={cn(
                    "mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-45",
                    isSelected
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-primary",
                  )}
                >
                  {isSelected ? <Check aria-hidden="true" className="size-4" /> : <GitCompareArrows aria-hidden="true" className="size-4" />}
                  {isSelected ? "Selected to compare" : "Select for comparison"}
                </button>
              ) : (
                <p className="mt-4 rounded-xl bg-muted/45 px-3 py-2.5 text-center text-xs text-muted-foreground">
                  Comparison is available for housing listings.
                </p>
              )}

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                <p className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><MapPin aria-hidden="true" className="size-3.5 text-primary" />{post.locality}, {post.city}</p>
                <p className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><IndianRupee aria-hidden="true" className="size-3.5 text-primary" />{post.priceLabel}</p>
                <p className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><CalendarDays aria-hidden="true" className="size-3.5 text-primary" />{post.moveInLabel}</p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <p className="text-xs text-muted-foreground">Saved {post.savedAt}</p>
                <Link href={post.detailHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  View details <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {activeSelection.length >= 2 ? (
        <div className="sticky bottom-4 z-20 mx-auto mt-5 flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-background/95 p-3 shadow-xl backdrop-blur">
          <p className="pl-2 text-sm font-semibold">{activeSelection.length} listings ready</p>
          <Link href={compareHref} className={buttonVariants()}>
            <GitCompareArrows aria-hidden="true" className="size-4" /> Compare
          </Link>
        </div>
      ) : null}
    </>
  );
}
