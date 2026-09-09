"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  IndianRupee,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageCircle,
  PencilLine,
  Route,
  Search,
  SearchX,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";

import { joinCommunityAction } from "@/app/community/actions";
import { CommunityChat } from "@/components/community/community-chat";
import { CommunityPostCard } from "@/components/community/community-page";
import { LocalityPulseCard } from "@/components/community/locality-pulse";
import { SaveSearchButton } from "@/components/saved/saved-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { communityPath } from "@/lib/community";
import {
  activeCommunityFilterCount,
  communityFilterQuery,
} from "@/lib/discovery";
import { cn } from "@/lib/utils";
import { rankListingRecommendations } from "@/lib/recommendations";
import type {
  CommunityLocationOption,
  CommunityPost,
} from "@/types/community";
import type { CommunityChatIdentity } from "@/types/community-chat";
import type {
  CommunityPostFilters,
  CommunityPostTypeCounts,
} from "@/types/discovery";
import type { UserProfile } from "@/types/profile";
import type { LocalityPulse } from "@/types/locality-pulse";

const roomTabs: {
  label: string;
  value: CommunityPostFilters["postType"];
}[] = [
  { label: "All", value: null },
  { label: "Need Room", value: "NEED_ROOM" },
  { label: "Room Available", value: "ROOM_AVAILABLE" },
  { label: "Need Flatmate", value: "NEED_FLATMATE" },
  { label: "PG Available", value: "PG_AVAILABLE" },
];

const selectClassName =
  "h-11 w-full appearance-none rounded-xl border border-input bg-background pl-10 pr-9 text-sm font-semibold text-foreground shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

export function CommunityRoom({
  community,
  localityPulse,
  locations,
  posts,
  postTypeCounts,
  filters,
  viewerProfile,
  isAuthenticated,
  isMember,
  chatIdentity,
  initialChatUnreadCount,
  initialView,
}: {
  community: CommunityLocationOption;
  localityPulse: LocalityPulse;
  locations: CommunityLocationOption[];
  posts: CommunityPost[];
  postTypeCounts: CommunityPostTypeCounts;
  filters: CommunityPostFilters;
  viewerProfile: UserProfile | null;
  isAuthenticated: boolean;
  isMember: boolean;
  chatIdentity: CommunityChatIdentity | null;
  initialChatUnreadCount: number;
  initialView: "posts" | "chat";
}) {
  const router = useRouter();
  const currentPath = communityPath(community);
  const cities = useMemo(
    () => [...new Set(locations.map((location) => location.city))],
    [locations],
  );
  const [destinationCity, setDestinationCity] = useState(community.city);
  const destinationLocations = useMemo(
    () => locations.filter((location) => location.city === destinationCity),
    [destinationCity, locations],
  );
  const [destinationId, setDestinationId] = useState(community.id);
  const destination =
    destinationLocations.find((location) => location.id === destinationId) ??
    destinationLocations[0];
  const [activeView, setActiveView] = useState<"posts" | "chat">(
    initialView === "chat" && isMember ? "chat" : "posts",
  );
  const [chatUnreadCount, setChatUnreadCount] = useState(
    initialChatUnreadCount,
  );
  const [joinError, setJoinError] = useState("");
  const [isJoining, startJoinTransition] = useTransition();

  const activeFilterCount = activeCommunityFilterCount(filters);
  const currentFilterQuery = communityFilterQuery(filters, filters.postType);
  const savedSearchHref = `${currentPath}${currentFilterQuery ? `?${currentFilterQuery}` : ""}`;
  const allPostCount = Object.values(postTypeCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const displayedPosts = useMemo(
    () =>
      rankListingRecommendations(
        posts,
        viewerProfile,
        filters.sort === "recommended",
      ),
    [filters.sort, posts, viewerProfile],
  );

  const changeDestinationCity = (city: string) => {
    setDestinationCity(city);
    setDestinationId(
      locations.find((location) => location.city === city)?.id ?? "",
    );
  };

  const joinCommunity = () => {
    setJoinError("");
    startJoinTransition(async () => {
      const result = await joinCommunityAction(community.id);
      if (!result.success) {
        setJoinError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <section className="border-b border-border/70 bg-card/45">
        <div className="content-shell py-9 sm:py-12">
          <div className="mx-auto max-w-5xl">
            <Link
              href="/community"
              className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              All communities
            </Link>

            <div className="mt-6 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                  <MapPin aria-hidden="true" className="size-4" />
                  {community.city}
                  {isMember ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                      <Check aria-hidden="true" className="size-3" /> Joined
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
                  {community.locality} community
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {community.description ||
                    `Rooms, flatmates, and PG listings from people in ${community.locality}.`}
                </p>
                <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <UsersRound aria-hidden="true" className="size-4 text-primary" />
                  {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                {isAuthenticated ? (
                  <>
                    {!isMember ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={joinCommunity}
                        disabled={isJoining}
                      >
                        {isJoining ? (
                          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                        ) : (
                          <UsersRound aria-hidden="true" className="size-4" />
                        )}
                        {isJoining ? "Joining..." : "Join Community"}
                      </Button>
                    ) : null}
                    <Link
                      href={`${currentPath}/create`}
                      className={cn(buttonVariants({ size: "lg" }), "h-12 px-6")}
                    >
                      <PencilLine aria-hidden="true" className="size-4" />
                      Create Post
                    </Link>
                  </>
                ) : (
                  <Link
                    href={`/login?next=${encodeURIComponent(currentPath)}`}
                    className={cn(buttonVariants({ size: "lg" }), "h-12 px-6")}
                  >
                    Log in to Join
                  </Link>
                )}
              </div>
            </div>

            {joinError ? (
              <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-destructive">
                <CircleAlert aria-hidden="true" className="size-4" />
                {joinError}
              </p>
            ) : null}

            <div className="mt-8 grid gap-3 rounded-2xl border border-border/75 bg-background p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <RoomSelect
                id="room-city"
                label="City"
                value={destinationCity}
                onChange={changeDestinationCity}
                options={cities.map((city) => ({ value: city, label: city }))}
              />
              <RoomSelect
                id="room-locality"
                label="Locality"
                value={destination?.id ?? ""}
                onChange={setDestinationId}
                options={destinationLocations.map((location) => ({
                  value: location.id,
                  label: location.locality,
                }))}
              />
              {destination ? (
                <Link
                  href={communityPath(destination)}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-11 w-full sm:w-auto",
                  )}
                >
                  Visit locality
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-18 z-40 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="content-shell">
          <div className="mx-auto flex max-w-5xl gap-2 border-b border-border/60 py-3">
            <button
              type="button"
              onClick={() => setActiveView("posts")}
              className={cn(
                "rounded-xl px-4 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/25",
                activeView === "posts"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Structured Posts
            </button>
            <button
              type="button"
              onClick={() => setActiveView("chat")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/25",
                activeView === "chat"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              Group Chat
              {chatUnreadCount > 0 ? (
                <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold text-primary-foreground">
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </span>
              ) : null}
            </button>
          </div>
          {activeView === "posts" ? (
          <div
            role="tablist"
            aria-label="Filter locality posts"
            className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {roomTabs.map((tab) => {
              const count = tab.value ? postTypeCounts[tab.value] : allPostCount;
              const isActive = filters.postType === tab.value;
              const query = communityFilterQuery(filters, tab.value);
              return (
                <Link
                  key={tab.label}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="locality-community-feed"
                  href={query ? `${currentPath}?${query}` : currentPath}
                  scroll={false}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/25",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
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
                </Link>
              );
            })}
          </div>
          ) : null}
        </div>
      </div>

      {activeView === "posts" ? (
      <section className="content-shell py-8 sm:py-10">
        <div className="mx-auto mb-8 max-w-5xl">
          <LocalityPulseCard locality={community.locality} pulse={localityPulse} />
        </div>
        <div className="mx-auto max-w-3xl">
          <div className="surface-card mb-6 p-4 sm:p-5">
            <form action={currentPath} method="get" className="space-y-4">
              {filters.postType ? (
                <input type="hidden" name="type" value={filters.postType} />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <label className="relative block">
                  <span className="sr-only">Search community posts</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    name="q"
                    type="search"
                    defaultValue={filters.query}
                    placeholder="Search posts or people"
                    className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-3 focus:ring-ring/15"
                  />
                </label>
                <label className="relative block">
                  <span className="sr-only">Sort posts</span>
                  <select
                    name="sort"
                    defaultValue={filters.sort}
                    className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm font-semibold outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                  >
                    <option value="recommended">Highest Living Fit</option>
                    <option value="newest">Newest first</option>
                    <option value="lowest-amount">Lowest amount</option>
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </label>
              </div>

              <details open={activeFilterCount > 0} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/20 [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
                  More filters
                  {activeFilterCount ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {activeFilterCount} active
                    </span>
                  ) : null}
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FilterInput
                    label="Minimum ₹"
                    name="min"
                    value={filters.budgetMin}
                    icon={IndianRupee}
                  />
                  <FilterInput
                    label="Maximum ₹"
                    name="max"
                    value={filters.budgetMax}
                    icon={IndianRupee}
                  />
                  <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                    Move in by
                    <input
                      type="date"
                      name="moveInBy"
                      defaultValue={filters.moveInBy}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                    />
                  </label>
                  <label className="relative space-y-1.5 text-xs font-semibold text-muted-foreground">
                    Gender preference
                    <span className="relative block">
                      <select
                        name="gender"
                        defaultValue={filters.genderPreference ?? ""}
                        className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
                      >
                        <option value="">Any preference</option>
                        <option value="WOMEN">Women welcome</option>
                        <option value="MEN">Men welcome</option>
                        <option value="ANY">Any-gender posts</option>
                      </select>
                      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    </span>
                  </label>
                  <label className="relative space-y-1.5 text-xs font-semibold text-muted-foreground">
                    Maximum distance
                    <span className="relative block">
                      <Route aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <select
                        name="distance"
                        defaultValue={filters.maximumDistanceKm?.toString() ?? ""}
                        disabled={!viewerProfile?.commute.destination}
                        className="h-11 w-full appearance-none rounded-xl border border-input bg-background pl-9 pr-9 text-sm font-medium text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-55 focus:border-primary focus:ring-3 focus:ring-ring/15"
                      >
                        <option value="">Any distance</option>
                        <option value="3">Within 3 km</option>
                        <option value="5">Within 5 km</option>
                        <option value="10">Within 10 km</option>
                        <option value="15">Within 15 km</option>
                        <option value="25">Within 25 km</option>
                      </select>
                      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    </span>
                  </label>
                </div>
                {!viewerProfile?.commute.destination ? (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    <Link href="/profile" className="font-semibold text-primary hover:underline">
                      Add a private commute destination
                    </Link>{" "}
                    to filter listings by approximate distance.
                  </p>
                ) : null}
              </details>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Link href={currentPath} className={cn(buttonVariants({ variant: "ghost" }), "w-full sm:w-auto")}>Clear filters</Link>
                <Button type="submit" className="w-full sm:w-auto">
                  <Search aria-hidden="true" className="size-4" />
                  Show matches
                </Button>
              </div>
            </form>
            {isAuthenticated ? (
              <div className="mt-4 flex justify-end border-t border-border/70 pt-4">
                <SaveSearchButton
                  kind="COMMUNITY_POSTS"
                  href={savedSearchHref}
                  defaultName={`${community.locality} housing`}
                />
              </div>
            ) : null}
          </div>

          <div className="mb-5">
            <h2 className="text-xl font-semibold">
              {filters.sort === "recommended"
                ? "Highest Living Fit"
                : filters.sort === "lowest-amount"
                  ? "Best-priced posts"
                  : "Latest posts"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {displayedPosts.length} {displayedPosts.length === 1 ? "match" : "matches"} in {community.locality}
            </p>
          </div>

          <div id="locality-community-feed" role="tabpanel" className="space-y-5">
            {displayedPosts.length ? (
              displayedPosts.map((post) => (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  viewerProfile={viewerProfile}
                  localityPulse={localityPulse}
                  showSafetyActions={isAuthenticated}
                  showSaveAction={isAuthenticated}
                />
              ))
            ) : (
              <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <SearchX aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">No matching posts</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Try widening the budget or date filters, or clear the search to see all posts in {community.locality}.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {chatIdentity ? (
        <CommunityChat
          communityId={community.id}
          locality={community.locality}
          currentUser={chatIdentity}
          isActive={activeView === "chat"}
          unreadCount={chatUnreadCount}
          onUnreadChange={setChatUnreadCount}
        />
      ) : activeView === "chat" ? (
        <section className="content-shell py-8 sm:py-10">
          <div className="surface-card mx-auto flex max-w-3xl flex-col items-center px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <LockKeyhole aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Members-only locality chat</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Join the {community.locality} community to read and participate in its live group chat.
            </p>
            {!isAuthenticated ? (
              <Link
                href={`/login?next=${encodeURIComponent(currentPath)}`}
                className={cn(buttonVariants(), "mt-6")}
              >
                Log in to Join
              </Link>
            ) : !isMember ? (
              <Button
                type="button"
                onClick={joinCommunity}
                disabled={isJoining}
                className="mt-6"
              >
                {isJoining ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <UsersRound aria-hidden="true" className="size-4" />
                )}
                {isJoining ? "Joining..." : "Join Community"}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function FilterInput({
  label,
  name,
  value,
  icon: Icon,
}: {
  label: string;
  name: string;
  value: number | null;
  icon: typeof IndianRupee;
}) {
  return (
    <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      <span className="relative block">
        <Icon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="number"
          min="0"
          max="10000000"
          step="500"
          name={name}
          defaultValue={value ?? ""}
          className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
        />
      </span>
    </label>
  );
}

function RoomSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary"
        />
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={selectClassName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}
