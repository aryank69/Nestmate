"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Armchair,
  Bath,
  BedDouble,
  CalendarDays,
  Car,
  ChevronDown,
  CircleAlert,
  Clock3,
  IndianRupee,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MessagesSquare,
  PencilLine,
  Route,
  SearchX,
  Sparkles,
  Trash2,
  UserRoundCheck,
  UsersRound,
  Wrench,
} from "lucide-react";

import {
  deleteCommunityPostAction,
  updatePostAvailabilityAction,
} from "@/app/community/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActivityStageControl } from "@/components/activity/activity-stage-control";
import { PostImageGallery } from "@/components/community/post-image-gallery";
import { MoveInReadinessIndicator } from "@/components/listings/move-in-readiness-indicator";
import { ListingDecisionPanel } from "@/components/listings/listing-decision-panel";
import { CompatibilitySummary } from "@/components/compatibility/compatibility-summary";
import { PropertyLocationMap } from "@/components/maps/property-location-map";
import { RecommendationSummary } from "@/components/recommendations/recommendation-summary";
import { ResponsivenessIndicator } from "@/components/responsiveness-indicator";
import { SavePostButton } from "@/components/saved/saved-controls";
import { SafetyActions } from "@/components/trust-safety/safety-actions";
import { TrustScoreIndicator } from "@/components/trust/trust-score-indicator";
import { ListingRealityScoreIndicator } from "@/components/trust/listing-reality-score";
import { TrustBadges } from "@/components/verification/trust-badges";
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
import { calculateListingRecommendation } from "@/lib/recommendations";
import type {
  CommunityListingDetails,
  CommunityPost,
  CommunityPostCategory,
  CommunityLocationOption,
} from "@/types/community";
import type { UserProfile } from "@/types/profile";
import type { LocalityPulse } from "@/types/locality-pulse";

const categoryStyles: Record<CommunityPostCategory, string> = {
  "Need a Room": "bg-accent text-accent-foreground",
  "Room Available": "bg-secondary text-secondary-foreground",
  "Need Flatmate": "bg-primary/10 text-primary",
  "PG Available": "bg-muted text-foreground",
};

const availabilityStyles = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  RESERVED: "border-amber-200 bg-amber-50 text-amber-800",
  CLOSED: "border-border bg-muted text-muted-foreground",
} as const;

const selectClassName =
  "h-12 w-full appearance-none rounded-xl border border-input bg-background pl-10 pr-10 text-sm font-semibold text-foreground shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

function ListingDetails({ details }: { details: CommunityListingDetails }) {
  const items = [
    { label: "Furnishing", value: details.furnishing, icon: Armchair },
    { label: "Occupancy", value: details.occupancy, icon: UsersRound },
    { label: "Room type", value: details.roomType, icon: BedDouble },
    { label: "Security deposit", value: details.deposit, icon: IndianRupee },
    { label: "Monthly maintenance", value: details.maintenance, icon: Wrench },
    {
      label: "Preferred tenant / flatmate",
      value: details.preferredOccupant,
      icon: UserRoundCheck,
    },
    { label: "Attached bathroom", value: details.attachedBathroom, icon: Bath },
    { label: "Parking", value: details.parking, icon: Car },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-border/80 bg-muted/25 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <BedDouble aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h4 className="font-semibold">Home details</h4>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The essentials for planning your visit and move.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border/70 bg-background p-3.5">
            <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon aria-hidden="true" className="size-3.5 text-primary" />
              {label}
            </dt>
            <dd className="mt-1.5 text-sm font-semibold">
              {value ?? "Not specified"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
          Amenities
        </p>
        {details.amenities.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {details.amenities.map((amenity) => (
              <span key={amenity} className="rounded-full border border-primary/15 bg-primary/[0.05] px-3 py-1.5 text-xs font-medium text-foreground">
                {amenity}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">No amenities listed.</p>
        )}
      </div>
    </section>
  );
}

export function CommunityPostCard({
  post,
  viewerProfile,
  localityPulse = null,
  showSafetyActions = Boolean(viewerProfile),
  showSaveAction = Boolean(viewerProfile),
  detail = false,
}: {
  post: CommunityPost;
  viewerProfile: UserProfile | null;
  localityPulse?: LocalityPulse | null;
  showSafetyActions?: boolean;
  showSaveAction?: boolean;
  detail?: boolean;
}) {
  const candidateProfile = post.author.compatibilityProfile;
  const compatibility =
    viewerProfile && candidateProfile
      ? calculateCompatibility(
          compatibilityProfileFromUserProfile(viewerProfile),
          candidateProfile,
        )
      : null;
  const recommendation =
    post.recommendation ??
    (viewerProfile
      ? calculateListingRecommendation(post, viewerProfile)
      : null);

  return (
    <article className="group/card surface-card p-5 transition-[border-color,box-shadow] hover:border-primary/20 hover:shadow-xl hover:shadow-foreground/[0.06] sm:p-6">
      <header className="flex items-start gap-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground ring-4 ring-secondary/35 sm:size-12">
          {post.author.initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-base font-semibold">
              {post.author.name}
            </p>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {post.author.role}
          </p>
          <div className="mt-2">
            <ResponsivenessIndicator value={post.author.responsiveness} />
          </div>
          <TrustBadges
            verification={post.author.verification}
            compact
            showDisclaimer={detail}
            className="mt-2"
          />
          <TrustScoreIndicator
            value={post.author.trust}
            details={detail}
            className="mt-2"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showSaveAction && post.availability.status !== "CLOSED" ? (
            <SavePostButton
              postId={post.id}
              initialSaved={Boolean(post.isSaved)}
            />
          ) : null}
          <span
            className={cn(
              "hidden rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex",
              categoryStyles[post.category],
            )}
          >
            {post.category}
          </span>
          {showSafetyActions && !post.isOwner ? (
            <SafetyActions
              target={{ type: "POST", id: post.id, label: "post" }}
              user={{ id: post.author.id, name: post.author.name }}
            />
          ) : null}
        </div>
      </header>

      <PostImageGallery images={post.images} title={post.title} detail={detail} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
            availabilityStyles[post.availability.status],
          )}
        >
          {post.availability.label}
        </span>
        {post.availability.isStale ? (
          <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
            Stale listing
          </span>
        ) : null}
        <span className="text-xs font-medium text-muted-foreground">
          {post.availability.freshnessLabel}
        </span>
        <TrustBadges verification={post.verification} compact />
        {post.category === "Room Available" || post.category === "PG Available" ? (
          <>
            {post.readiness ? (
              <MoveInReadinessIndicator
                value={post.readiness}
                details={detail}
                className={detail ? "mt-3 basis-full" : undefined}
              />
            ) : null}
            <TrustScoreIndicator
              value={post.trust}
              scope="listing"
              details={detail}
            />
            <ListingRealityScoreIndicator
              value={post.reality}
              details={detail}
            />
          </>
        ) : null}
      </div>

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
            {post.listingDetails ? "Available from" : "Move-in"}
          </dt>
          <dd className="mt-1.5 text-sm font-semibold">{post.moveInDate}</dd>
        </div>
      </dl>

      {post.commute ? (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.045] px-3.5 py-3">
          <Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {post.commute.distanceLabel} from {post.commute.destinationLabel}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {post.commute.relevanceLabel} · Straight-line estimate
              {post.commute.basedOnApproximateLocation
                ? " using the listing’s privacy-rounded area"
                : " using the shared map pin"}
            </p>
          </div>
        </div>
      ) : null}

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

      {(post.category === "Room Available" || post.category === "PG Available") &&
      post.readiness ? (
        <ListingDecisionPanel
          livingFit={recommendation}
          reality={post.reality}
          readiness={post.readiness}
          localityPulse={localityPulse}
          locality={post.locality}
          compact={!detail}
          className="mt-5"
        />
      ) : null}

      {detail && post.listingDetails ? (
        <ListingDetails details={post.listingDetails} />
      ) : null}

      {detail && post.listingLocation ? (
        <PropertyLocationMap
          location={post.listingLocation}
          locality={post.locality}
        />
      ) : null}

      {detail ||
      (post.category !== "Room Available" && post.category !== "PG Available") ? (
        <RecommendationSummary result={recommendation} />
      ) : null}

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
        {!detail ? (
          <Link
            href={`/community/post/${encodeURIComponent(post.id)}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-auto",
            )}
          >
            View Details
          </Link>
        ) : null}
        {showSaveAction &&
        !post.isOwner &&
        (post.category === "Room Available" || post.category === "PG Available") &&
        post.availability.status !== "CLOSED" ? (
          <ActivityStageControl
            targetType="LISTING"
            targetId={post.id}
            initialStage={post.activityStage}
            compact
            className="w-full sm:w-48"
          />
        ) : null}
        {post.isOwner ? (
          <PostOwnerActions
            postId={post.id}
            availability={post.availability}
          />
        ) : (
          <Link
            href={{
              pathname: "/chat",
              query: {
                user: post.author.authUserId,
                post: post.id,
              },
            }}
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

function PostOwnerActions({
  postId,
  availability,
}: {
  postId: string;
  availability: CommunityPost["availability"];
}) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startDeleteTransition] = useTransition();
  const [isStatusPending, startStatusTransition] = useTransition();

  const updateStatus = (status: string) => {
    setError("");
    startStatusTransition(async () => {
      const result = await updatePostAvailabilityAction(postId, status);
      if (result.success) {
        router.refresh();
        return;
      }
      setError(result.message);
    });
  };

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
      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/35 p-2.5 sm:min-w-56">
        <label
          htmlFor={`availability-${postId}`}
          className="text-xs font-semibold text-muted-foreground"
        >
          Listing status
        </label>
        <div className="relative">
          <select
            id={`availability-${postId}`}
            value={availability.status}
            onChange={(event) => updateStatus(event.target.value)}
            disabled={isStatusPending}
            className="h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm font-semibold outline-none focus:border-primary focus:ring-3 focus:ring-ring/15 disabled:opacity-60"
          >
            <option value="AVAILABLE">Available</option>
            <option value="RESERVED">Reserved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        {availability.isStale && availability.status !== "CLOSED" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => updateStatus(availability.status)}
            disabled={isStatusPending}
          >
            {isStatusPending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Clock3 aria-hidden="true" className="size-4" />
            )}
            Confirm current status
          </Button>
        ) : null}
      </div>
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
              Roomzi Community
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
