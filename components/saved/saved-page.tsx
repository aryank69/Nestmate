import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  CircleAlert,
  Search,
  UserRound,
} from "lucide-react";

import { DeleteSavedSearchButton } from "@/components/saved/saved-controls";
import { SavedPostGrid } from "@/components/saved/saved-post-grid";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SavedPostView, SavedSearchView } from "@/types/saved";

export function SavedPage({
  posts,
  searches,
  error,
}: {
  posts: SavedPostView[];
  searches: SavedSearchView[];
  error: string;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Bookmark aria-hidden="true" className="size-4" />
          Your shortlist
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">Saved</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Keep promising housing posts close and rerun your favourite searches without setting every filter again.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}
        </p>
      ) : null}

      <section className="mt-10" aria-labelledby="saved-searches-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Reusable filters</p>
            <h2 id="saved-searches-heading" className="mt-1 text-2xl font-semibold">Saved searches</h2>
          </div>
          <Link href="/flatmates" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Search aria-hidden="true" className="size-3.5" />New search
          </Link>
        </div>

        {searches.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {searches.map((search) => (
              <article key={search.id} className="surface-card flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    {search.kind === "PEOPLE" ? <UserRound aria-hidden="true" className="size-4.5" /> : <Search aria-hidden="true" className="size-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">{search.kindLabel}</p>
                    <h3 className="mt-1 text-lg font-semibold">{search.name}</h3>
                  </div>
                  <DeleteSavedSearchButton id={search.id} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {search.filterLabels.length ? search.filterLabels.map((label) => (
                    <span key={label} className="rounded-full border border-border/80 bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground">{label}</span>
                  )) : (
                    <span className="text-sm text-muted-foreground">All available matches</span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                  <p className="text-xs text-muted-foreground">Saved {search.savedAt}</p>
                  <Link href={search.href} className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
                    Run search<ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCard title="No saved searches yet" body="Apply filters in a community or flatmate search, then choose Save this search." href="/flatmates" action="Find flatmates" />
        )}
      </section>

      <section className="mt-12" aria-labelledby="saved-posts-heading">
        <div>
          <p className="text-sm font-semibold text-primary">Housing shortlist</p>
          <h2 id="saved-posts-heading" className="mt-1 text-2xl font-semibold">Saved posts</h2>
        </div>

        {posts.length ? (
          <SavedPostGrid posts={posts} />
        ) : (
          <EmptyCard title="No saved posts yet" body="Use the Save button on a community post to add it to your shortlist." href="/community" action="Browse communities" />
        )}
      </section>
    </div>
  );
}

function EmptyCard({ title, body, href, action }: { title: string; body: string; href: string; action: string }) {
  return (
    <div className="surface-card mt-5 flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Bookmark aria-hidden="true" className="size-5" /></span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      <Link href={href} className={cn(buttonVariants({ variant: "outline" }), "mt-5")}>{action}</Link>
    </div>
  );
}
