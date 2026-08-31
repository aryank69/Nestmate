"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageCircle,
  PencilLine,
  SearchX,
  UsersRound,
} from "lucide-react";

import { joinCommunityAction } from "@/app/community/actions";
import { CommunityChat } from "@/components/community/community-chat";
import { CommunityPostCard } from "@/components/community/community-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { communityPath } from "@/lib/community";
import { cn } from "@/lib/utils";
import type {
  CommunityLocationOption,
  CommunityPost,
  CommunityPostCategory,
} from "@/types/community";
import type { CommunityChatIdentity } from "@/types/community-chat";
import type { UserProfile } from "@/types/profile";

const roomTabs: {
  label: string;
  value: CommunityPostCategory | null;
}[] = [
  { label: "All", value: null },
  { label: "Need Room", value: "Need a Room" },
  { label: "Room Available", value: "Room Available" },
  { label: "Need Flatmate", value: "Need Flatmate" },
  { label: "PG Available", value: "PG Available" },
];

const selectClassName =
  "h-11 w-full appearance-none rounded-xl border border-input bg-background pl-10 pr-9 text-sm font-semibold text-foreground shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

export function CommunityRoom({
  community,
  locations,
  posts,
  viewerProfile,
  isAuthenticated,
  isMember,
  chatIdentity,
  initialChatUnreadCount,
}: {
  community: CommunityLocationOption;
  locations: CommunityLocationOption[];
  posts: CommunityPost[];
  viewerProfile: UserProfile | null;
  isAuthenticated: boolean;
  isMember: boolean;
  chatIdentity: CommunityChatIdentity | null;
  initialChatUnreadCount: number;
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
  const [selectedCategory, setSelectedCategory] =
    useState<CommunityPostCategory | null>(null);
  const [activeView, setActiveView] = useState<"posts" | "chat">("posts");
  const [chatUnreadCount, setChatUnreadCount] = useState(
    initialChatUnreadCount,
  );
  const [joinError, setJoinError] = useState("");
  const [isJoining, startJoinTransition] = useTransition();

  const visiblePosts = selectedCategory
    ? posts.filter((post) => post.category === selectedCategory)
    : posts;

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
              const count = tab.value
                ? posts.filter((post) => post.category === tab.value).length
                : posts.length;
              const isActive = selectedCategory === tab.value;
              return (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="locality-community-feed"
                  onClick={() => setSelectedCategory(tab.value)}
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
                </button>
              );
            })}
          </div>
          ) : null}
        </div>
      </div>

      {activeView === "posts" ? (
      <section className="content-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Latest posts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {visiblePosts.length} {visiblePosts.length === 1 ? "post" : "posts"} in {community.locality}
            </p>
          </div>

          <div id="locality-community-feed" role="tabpanel" className="space-y-5">
            {visiblePosts.length ? (
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
                  Be the first to publish a structured housing post in {community.locality}.
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
