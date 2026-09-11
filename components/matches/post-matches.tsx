import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  ClipboardCheck,
  MapPin,
  Scale,
  SearchX,
  UsersRound,
} from "lucide-react";

import { PeopleCard } from "@/components/people/people-discovery";
import { RoomCompareProvider } from "@/components/rooms/room-compare";
import { RoomListingCard } from "@/components/rooms/room-discovery";
import { buttonVariants } from "@/components/ui/button";
import { communityPath } from "@/lib/community";
import { postMatchHeading } from "@/lib/post-match";
import { cn } from "@/lib/utils";
import type { PostMatchData } from "@/types/post-matches";

export function PostMatches({ data }: { data: PostMatchData }) {
  const heading = postMatchHeading(data.source.type);
  const sourceHref = `/community/post/${encodeURIComponent(data.source.id)}`;
  const localityHref = communityPath({
    citySlug: data.source.citySlug,
    localitySlug: data.source.localitySlug,
  });
  const hasMatches = data.listings.length > 0 || data.people.length > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={sourceHref}
        className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        View your post
      </Link>

      <header className="mt-6 rounded-3xl border border-primary/15 bg-primary/[0.045] p-5 sm:p-7">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ClipboardCheck aria-hidden="true" className="size-4" />
          {heading.eyebrow}
        </p>
        <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
          {heading.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          {heading.description}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-border/80 bg-background px-3 py-1.5 font-semibold">
            {data.source.title}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1.5 text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5 text-primary" />
            {data.source.locality}, {data.source.city}
          </span>
        </div>
      </header>

      {!hasMatches ? (
        <section className="surface-card mt-6 px-6 py-14 text-center">
          <SearchX aria-hidden="true" className="mx-auto size-9 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">No eligible matches yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Roomzi kept your locality, budget, timing, privacy, visibility, and block rules in place. New eligible results will appear in discovery as people post.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            {data.roomsHref ? (
              <Link href={data.roomsHref} className={buttonVariants()}>
                Browse matching homes
              </Link>
            ) : null}
            <Link
              href={data.peopleHref}
              className={buttonVariants({ variant: data.roomsHref ? "outline" : "default" })}
            >
              Browse matching people
            </Link>
            <Link href={localityHref} className={buttonVariants({ variant: "ghost" })}>
              Open locality community
            </Link>
          </div>
        </section>
      ) : null}

      {data.listings.length ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                <BedDouble aria-hidden="true" className="size-4" />
                Suitable homes
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                Recommended rooms and PGs
              </h2>
            </div>
            {data.roomsHref ? (
              <Link href={data.roomsHref} className={buttonVariants({ variant: "outline" })}>
                See filtered discovery <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
          <RoomCompareProvider>
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.listings.map((post) => (
                <RoomListingCard
                  key={post.id}
                  post={post}
                  isAuthenticated
                />
              ))}
            </div>
          </RoomCompareProvider>
        </section>
      ) : null}

      {data.people.length ? (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                <UsersRound aria-hidden="true" className="size-4" />
                Relevant people
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                Compatible flatmates and seekers
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Shortlist people to save them, then compare up to four privately.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/shortlist" className={buttonVariants({ variant: "outline" })}>
                <Scale aria-hidden="true" className="size-4" />
                Compare shortlist
              </Link>
              <Link href={data.peopleHref} className={buttonVariants()}>
                See filtered discovery <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {data.people.map((profile) => (
              <PeopleCard key={profile.id} profile={profile} />
            ))}
          </div>
        </section>
      ) : null}

      {hasMatches ? (
        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 sm:flex-row sm:items-center">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            These are ranked eligible results—not overrides. Your post-derived filters, blocks, content visibility, and existing access rules remain in effect.
          </p>
          <Link href={localityHref} className={cn(buttonVariants({ variant: "ghost" }), "shrink-0")}>
            Open locality community
          </Link>
        </div>
      ) : null}
    </div>
  );
}
