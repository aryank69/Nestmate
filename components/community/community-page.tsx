"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  IndianRupee,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MessagesSquare,
  PencilLine,
  SearchX,
  Trash2,
  UsersRound,
} from "lucide-react";

import {
  deleteCommunityPostAction,
} from "@/app/community/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { CompatibilitySummary } from "@/components/compatibility/compatibility-summary";
import {
  communityCategories,
  isPostCategory,
  type CommunityCategory,
} from "@/data/community-posts";
import { cn } from "@/lib/utils";
import {
  calculateCompatibility,
  compatibilityProfileFromUserProfile,
} from "@/lib/compatibility";
import type {
  CommunityPost,
  CommunityPostCategory,
  CommunityLocationOption,
} from "@/types/community";
import type { UserProfile } from "@/types/profile";

const categoryStyles: Record<CommunityPostCategory, string> = {
  "Need a Room": "bg-accent text-accent-foreground",
  "Room Available": "bg-secondary text-secondary-foreground",
  "Need Flatmate": "bg-primary/10 text-primary",
  "PG Available": "bg-muted text-foreground",
};

const selectClassName =
  "h-12 w-full appearance-none rounded-xl border border-input bg-background pl-10 pr-10 text-sm font-semibold text-foreground shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

export function CommunityPostCard({
  post,
  viewerProfile,
}: {
  post: CommunityPost;
  viewerProfile: UserProfile | null;
}) {
  const candidateProfile = post.author.compatibilityProfile;
  const compatibility =
    viewerProfile && candidateProfile
      ? calculateCompatibility(
          compatibilityProfileFromUserProfile(viewerProfile),
          candidateProfile,
        )
      : null;

  return (
    <article className="surface-card p-5 transition-[border-color,box-shadow] hover:border-primary/20 hover:shadow-xl hover:shadow-foreground/[0.06] sm:p-6">
      <header className="flex items-start gap-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground ring-4 ring-secondary/35 sm:size-12">
          {post.author.initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-base font-semibold">
              {post.author.name}
            </p>
            {post.author.verified ? (
              <BadgeCheck
                aria-label="Verified member"
                className="size-4.5 fill-primary text-primary-foreground"
              />
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {post.author.role}
          </p>
        </div>

        <span
          className={cn(
            "hidden shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex",
            categoryStyles[post.category],
          )}
        >
          {post.category}
        </span>
      </header>

      <div className="mt-5">
        <span
          className={cn(
            "mb-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold sm:hidden",
            categoryStyles[post.category],
          )}
        >
          {post.category}
        </span>
        <h3 className="text-xl font-semibold leading-7 tracking-[-0.025em] sm:text-[1.35rem]">
          {post.title}
        </h3>
        <p className="mt-2.5 text-[0.9375rem] leading-6 text-muted-foreground">
          {post.description}
        </p>
      </div>

      <dl className="mt-5 grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-muted/45 px-3.5 py-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5 text-primary" />
            Locality
          </dt>
          <dd className="mt-1.5 text-sm font-semibold">{post.locality}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/45 px-3.5 py-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <IndianRupee aria-hidden="true" className="size-3.5 text-primary" />
            Budget / rent
          </dt>
          <dd className="mt-1.5 text-sm font-semibold">{post.priceLabel}</dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/45 px-3.5 py-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5 text-primary" />
            Move-in
          </dt>
          <dd className="mt-1.5 text-sm font-semibold">{post.moveInDate}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {compatibility ? (
        <CompatibilitySummary result={compatibility} />
      ) : candidateProfile ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Sign in and complete your profile to see a transparent preference
          match score.
        </div>
      ) : null}

      <footer className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:mr-auto">
          <Clock3 aria-hidden="true" className="size-3.5" />
          Posted {post.postedAt}
        </p>
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          View Details
        </Button>
        {post.isOwner ? (
          <PostOwnerActions postId={post.id} />
        ) : (
          <Link
            href="/chat"
            className={cn(buttonVariants(), "w-full sm:w-auto")}
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            Message
          </Link>
        )}
      </footer>
    </article>
  );
}

function PostOwnerActions({ postId }: { postId: string }) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startDeleteTransition] = useTransition();

  const deletePost = () => {
    setError("");
    startDeleteTransition(async () => {
      const result = await deleteCommunityPostAction(postId);
      if (result.success) {
        router.refresh();
        return;
      }
      setError(result.message);
      setIsConfirming(false);
    });
  };

  if (isConfirming) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-auto">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={deletePost}
            disabled={isPending}
            className="flex-1 sm:flex-none"
          >
            {isPending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Trash2 aria-hidden="true" className="size-4" />
            )}
            {isPending ? "Deleting..." : "Confirm Delete"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsConfirming(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <div className="flex gap-2">
        <Link
          href={`/community/post/${encodeURIComponent(postId)}/edit`}
          className={cn(buttonVariants(), "flex-1 sm:flex-none")}
        >
          <PencilLine aria-hidden="true" className="size-4" />
          Edit
        </Link>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setIsConfirming(true)}
          className="flex-1 sm:flex-none"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Delete
        </Button>
      </div>
      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="size-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CommunityPage({
  viewerProfile,
  posts,
  locations,
}: {
  viewerProfile: UserProfile | null;
  posts: CommunityPost[];
  locations: CommunityLocationOption[];
}) {
  const cities = useMemo(
    () => [...new Set(locations.map((location) => location.city))],
    [locations],
  );
  const [selectedCity, setSelectedCity] = useState(cities[0] ?? "");
  const [selectedLocality, setSelectedLocality] = useState("All localities");
  const [selectedCategory, setSelectedCategory] =
    useState<CommunityCategory>("All Posts");

  const localities = useMemo(
    () => [
      "All localities",
      ...new Set(
        locations
          .filter((location) => location.city === selectedCity)
          .map((location) => location.locality),
      ),
    ],
    [locations, selectedCity],
  );

  const locationPosts = posts.filter(
    (post) =>
      post.city === selectedCity &&
      (selectedLocality === "All localities" ||
        post.locality === selectedLocality),
  );

  const visiblePosts = locationPosts.filter(
    (post) =>
      !isPostCategory(selectedCategory) ||
      post.category === selectedCategory,
  );

  const selectedLocation =
    selectedLocality === "All localities" ? selectedCity : selectedLocality;

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedLocality("All localities");
  };

  return (
    <>
      <section className="border-b border-border/70 bg-card/45">
        <div className="content-shell py-10 sm:py-14">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <MessagesSquare aria-hidden="true" className="size-4" />
              NestMate Community
            </div>

            <div className="mt-4 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-2xl">
                <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
                  {selectedLocation} housing community
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Connect with people looking for rooms, flatmates, and PGs in
                  your locality.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  href={{
                    pathname: "/community/create",
                    query: {
                      city: selectedCity,
                      locality:
                        selectedLocality === "All localities"
                          ? undefined
                          : selectedLocality,
                    },
                  }}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 px-6",
                  )}
                >
                  <PencilLine aria-hidden="true" className="size-4.5" />
                  Create Post
                </Link>
                <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background px-4 py-3 shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <UsersRound aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Local conversations</p>
                    <p className="text-xs text-muted-foreground">
                      Rooms, flatmates &amp; PGs
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="community-city" className="text-sm font-semibold">
                  City
                </label>
                <div className="relative">
                  <MapPin
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary"
                  />
                  <select
                    id="community-city"
                    value={selectedCity}
                    onChange={(event) => handleCityChange(event.target.value)}
                    className={selectClassName}
                  >
                    {cities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="community-locality"
                  className="text-sm font-semibold"
                >
                  Locality
                </label>
                <div className="relative">
                  <MapPin
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <select
                    id="community-locality"
                    value={selectedLocality}
                    onChange={(event) =>
                      setSelectedLocality(event.target.value)
                    }
                    className={selectClassName}
                  >
                    {localities.map((locality) => (
                      <option key={locality}>{locality}</option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-18 z-40 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="content-shell">
          <div
            role="tablist"
            aria-label="Filter community posts"
            className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {communityCategories.map((category) => {
              const count =
                category === "All Posts"
                  ? locationPosts.length
                  : locationPosts.filter((post) => post.category === category)
                      .length;
              const isActive = selectedCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="community-feed"
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/25",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/15"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {category}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.6875rem]",
                      isActive
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="content-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Latest posts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {visiblePosts.length}{" "}
                {visiblePosts.length === 1 ? "post" : "posts"} in{" "}
                {selectedLocation}
              </p>
            </div>
          </div>

          <div
            id="community-feed"
            role="tabpanel"
            className="space-y-5"
          >
            {visiblePosts.length > 0 ? (
              visiblePosts.map((post) => (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  viewerProfile={viewerProfile}
                />
              ))
            ) : (
              <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <SearchX aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">No posts here yet</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Be the first to publish a housing post here, or try another
                  category or locality.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
