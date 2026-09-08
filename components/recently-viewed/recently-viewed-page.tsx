import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  Clock3,
  History,
  UserRound,
} from "lucide-react";

import {
  ClearRecentViewsButton,
  RemoveRecentViewButton,
} from "@/components/recently-viewed/recent-view-controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecentViewItem } from "@/types/recently-viewed";

export function RecentlyViewedPage({
  items,
  error,
}: {
  items: RecentViewItem[];
  error: string;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <History aria-hidden="true" className="size-4" />
            Pick up where you left off
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Recently Viewed
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Your latest listing and flatmate profile visits, kept private to your account.
          </p>
        </div>
        {items.length ? <ClearRecentViewsButton /> : null}
      </div>

      {error ? (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {items.length ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.historyId} className="surface-card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  {item.kind === "POST" ? (
                    <Building2 aria-hidden="true" className="size-4.5" />
                  ) : (
                    <UserRound aria-hidden="true" className="size-4.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                    {item.eyebrow}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold leading-6">{item.title}</h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <RemoveRecentViewButton historyId={item.historyId} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.details.map((detail) => (
                  <span key={detail} className="rounded-full border border-border/80 bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    {detail}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  Viewed {item.viewedAtLabel.toLowerCase()}
                </p>
                <Link href={item.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0") }>
                  View again
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="surface-card mt-8 flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <History aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Nothing viewed yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Open a listing or flatmate profile and it will appear here for easy access.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href="/community" className={buttonVariants({ variant: "outline" })}>
              Browse listings
            </Link>
            <Link href="/flatmates" className={buttonVariants()}>
              Find flatmates
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
