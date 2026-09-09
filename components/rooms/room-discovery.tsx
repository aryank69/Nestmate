import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  IndianRupee,
  MapPin,
  MessageCircle,
  Route,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { PostImageGallery } from "@/components/community/post-image-gallery";
import { MoveInReadinessIndicator } from "@/components/listings/move-in-readiness-indicator";
import {
  RoomCompareProvider,
  RoomListingActions,
} from "@/components/rooms/room-compare";
import { ListingRealityScoreIndicator } from "@/components/trust/listing-reality-score";
import { buttonVariants } from "@/components/ui/button";
import { activeRoomFilterCount } from "@/lib/room-discovery";
import { cn } from "@/lib/utils";
import type { CommunityLocationOption, CommunityPost } from "@/types/community";
import type { RoomDiscoveryFilters } from "@/types/discovery";

const inputClassName =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-3 focus:ring-ring/15";
const selectClassName = `${inputClassName} appearance-none pr-9`;

const kindOptions = [
  ["ALL", "All homes"],
  ["ROOM_AVAILABLE", "Room Available"],
  ["FLAT_SHARED", "Flat / shared flat"],
  ["PG_AVAILABLE", "PG"],
] as const;

function FilterSelect({
  label,
  name,
  value,
  options,
  anyLabel = "Any",
}: {
  label: string;
  name: string;
  value: string | null;
  options: readonly (readonly [string, string])[];
  anyLabel?: string;
}) {
  return (
    <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      <span className="relative block">
        <select name={name} defaultValue={value ?? ""} className={selectClassName}>
          <option value="">{anyLabel}</option>
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>{optionLabel}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
      </span>
    </label>
  );
}

function ScorePill({ post }: { post: CommunityPost }) {
  const result = post.recommendation;
  if (!result || result.score === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/45 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-3.5" />
        Add preferences for Living Fit
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-xs font-bold text-primary"
      title={result.reasons[0] ?? result.label}
    >
      <Sparkles aria-hidden="true" className="size-3.5" />
      Living Fit {result.score}%
    </span>
  );
}

function ListingCard({
  post,
  isAuthenticated,
}: {
  post: CommunityPost;
  isAuthenticated: boolean;
}) {
  const detailHref = `/community/post/${post.id}`;
  const messageHref = `/chat?user=${encodeURIComponent(post.author.authUserId)}&post=${encodeURIComponent(post.id)}`;
  const details = post.listingDetails;

  return (
    <article className="group/card flex h-full flex-col overflow-hidden rounded-3xl border border-border/75 bg-card p-4 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg sm:p-5">
      {post.images.length ? (
        <PostImageGallery images={post.images} title={post.title} />
      ) : (
        <div className="mt-1 flex aspect-[16/9] items-center justify-center rounded-2xl bg-gradient-to-br from-primary/[0.08] to-secondary/70 text-primary">
          <BedDouble aria-hidden="true" className="size-10" />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
          {post.category}
        </span>
        <span className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-semibold",
          post.availability.status === "AVAILABLE"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800",
        )}>
          {post.availability.label}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{post.availability.freshnessLabel}</span>
      </div>

      <h2 className="mt-3 text-xl font-semibold leading-7 tracking-[-0.025em]">
        <Link href={detailHref} className="outline-none hover:text-primary focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/20">
          {post.title}
        </Link>
      </h2>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
        {post.locality}, {post.city}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3 border-y border-border/65 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Monthly rent</p>
          <p className="mt-0.5 flex items-center text-lg font-bold tracking-tight">
            <IndianRupee aria-hidden="true" className="size-4" />
            {post.priceLabel.replace(/^₹/, "")}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-right text-xs font-semibold text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-4 text-primary" />
          {post.moveInDate}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <p className="rounded-xl bg-muted/45 px-3 py-2.5">
          <span className="block text-muted-foreground">Room</span>
          <span className="mt-0.5 block truncate font-semibold">{details?.roomType ?? "Details on request"}</span>
        </p>
        <p className="rounded-xl bg-muted/45 px-3 py-2.5">
          <span className="block text-muted-foreground">Furnishing</span>
          <span className="mt-0.5 block truncate font-semibold">{details?.furnishing ?? "Not specified"}</span>
        </p>
      </div>

      {details?.amenities.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {details.amenities.slice(0, 3).map((amenity) => (
            <span key={amenity} className="rounded-full border border-border/75 px-2.5 py-1 text-xs text-muted-foreground">{amenity}</span>
          ))}
          {details.amenities.length > 3 ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">+{details.amenities.length - 3}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ScorePill post={post} />
        {post.readiness ? <MoveInReadinessIndicator value={post.readiness} /> : null}
        <ListingRealityScoreIndicator value={post.reality} />
      </div>
      {post.recommendation?.reasons[0] ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
          {post.recommendation.reasons[0]}
        </p>
      ) : post.commute ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Route aria-hidden="true" className="size-3.5 text-primary" />
          {post.commute.distanceLabel} · {post.commute.relevanceLabel}
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        <RoomListingActions
          postId={post.id}
          isSaved={Boolean(post.isSaved)}
          isAuthenticated={isAuthenticated}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href={detailHref} className={buttonVariants({ variant: "outline" })}>
            View details <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          {post.isOwner ? (
            <Link href={`${detailHref}/edit`} className={buttonVariants()}>
              Edit listing
            </Link>
          ) : (
            <Link href={messageHref} className={buttonVariants()}>
              <MessageCircle aria-hidden="true" className="size-4" /> Message
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function RoomDiscovery({
  posts,
  locations,
  filters,
  isAuthenticated,
}: {
  posts: CommunityPost[];
  locations: CommunityLocationOption[];
  filters: RoomDiscoveryFilters;
  isAuthenticated: boolean;
}) {
  const activeFilters = activeRoomFilterCount(filters);
  const cities = [...new Map(locations.map((location) => [location.citySlug, location.city])).entries()];
  const advancedOpen = Boolean(
    filters.furnishing ||
    filters.roomType ||
    filters.amenities.length ||
    filters.maximumDistanceKm ||
    filters.minimumLivingFit !== null ||
    filters.minimumRealityScore !== null ||
    filters.minimumReadiness !== null,
  );

  return (
    <>
      <section className="border-b border-border/70 bg-card/45">
        <div className="content-shell py-10 sm:py-14">
          <div className="mx-auto max-w-6xl">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <BedDouble aria-hidden="true" className="size-4" />
              Find a Room
            </p>
            <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
                  A better place to land starts here.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Explore real rooms, shared flats, and PGs with clear costs, practical details, and transparent fit signals.
                </p>
              </div>
            </div>

            <form method="get" action="/rooms" className="surface-card mt-8 space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.35fr_0.8fr_1fr_0.85fr]">
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                  Search city, locality, or listing
                  <span className="relative block">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2" />
                    <input type="search" name="q" defaultValue={filters.query} placeholder="Koramangala, Bengaluru..." className={cn(inputClassName, "pl-10")} />
                  </span>
                </label>
                <FilterSelect label="City" name="city" value={filters.citySlug} options={cities} anyLabel="All cities" />
                <FilterSelect
                  label="Locality"
                  name="locality"
                  value={filters.communityId}
                  options={locations.map((location) => [location.id, `${location.locality}, ${location.city}`])}
                  anyLabel="All localities"
                />
                <FilterSelect label="Listing type" name="kind" value={filters.kind} options={kindOptions.slice(1)} anyLabel="All homes" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                  Minimum budget
                  <input type="number" min="0" name="min" defaultValue={filters.budgetMin ?? ""} placeholder="₹8,000" className={inputClassName} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                  Maximum budget
                  <input type="number" min="0" name="max" defaultValue={filters.budgetMax ?? ""} placeholder="₹25,000" className={inputClassName} />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                  Move in by
                  <input type="date" name="moveInBy" defaultValue={filters.moveInBy} className={inputClassName} />
                </label>
                <FilterSelect
                  label="Sort"
                  name="sort"
                  value={filters.sort}
                  anyLabel="Recommended"
                  options={[
                    ["newest", "Newest"],
                    ["lowest-rent", "Lowest rent"],
                    ["highest-readiness", "Highest readiness"],
                  ]}
                />
              </div>

              <details open={advancedOpen} className="group rounded-2xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold outline-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
                    More filters
                  </span>
                  <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FilterSelect label="Furnishing" name="furnishing" value={filters.furnishing} options={[["FURNISHED", "Furnished"], ["SEMI_FURNISHED", "Semi-furnished"], ["UNFURNISHED", "Unfurnished"]]} />
                  <FilterSelect label="Room type" name="roomType" value={filters.roomType} options={[["PRIVATE_ROOM", "Private room"], ["SHARED_ROOM", "Shared room"], ["ENTIRE_PLACE", "Entire flat"]]} />
                  <FilterSelect label="Maximum commute" name="distance" value={filters.maximumDistanceKm === null ? null : String(filters.maximumDistanceKm)} options={[["3", "Within 3 km"], ["5", "Within 5 km"], ["10", "Within 10 km"], ["20", "Within 20 km"]]} anyLabel="Any distance" />
                  <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                    Amenities
                    <input name="amenities" defaultValue={filters.amenities.join(", ")} placeholder="Wi-Fi, power backup" className={inputClassName} />
                  </label>
                  <FilterSelect label="Minimum Living Fit" name="livingFit" value={filters.minimumLivingFit === null ? null : String(filters.minimumLivingFit)} options={[["60", "60%+"], ["70", "70%+"], ["80", "80%+"]]} />
                  <FilterSelect label="Minimum Reality Score" name="reality" value={filters.minimumRealityScore === null ? null : String(filters.minimumRealityScore)} options={[["60", "60+"], ["70", "70+"], ["80", "80+"]]} />
                  <FilterSelect label="Minimum readiness" name="readiness" value={filters.minimumReadiness === null ? null : String(filters.minimumReadiness)} options={[["50", "50+"], ["65", "65+"], ["80", "80+"]]} />
                </div>
              </details>

              <div className="flex flex-col gap-3 border-t border-border/65 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  {activeFilters ? `${activeFilters} active filter${activeFilters === 1 ? "" : "s"}` : "Showing available homes across NestMate communities"}
                </p>
                <div className="flex gap-2">
                  {activeFilters ? <Link href="/rooms" className={buttonVariants({ variant: "ghost" })}>Clear</Link> : null}
                  <button type="submit" className={buttonVariants()}>
                    <Search aria-hidden="true" className="size-4" /> Search homes
                  </button>
                </div>
              </div>
            </form>

            {filters.maximumDistanceKm !== null && !isAuthenticated ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                Sign in and add a private commute destination to apply the distance filter. Exact destinations are never shown.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="content-shell py-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Available now</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              {posts.length} {posts.length === 1 ? "home" : "homes"} found
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Closed, hidden, blocked, and unavailable listings stay out of these results.
          </p>
        </div>

        {posts.length ? (
          <RoomCompareProvider>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <ListingCard key={post.id} post={post} isAuthenticated={isAuthenticated} />
              ))}
            </div>
          </RoomCompareProvider>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-border bg-card px-5 py-14 text-center">
            <SearchX aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold">
              {activeFilters ? "No homes match these filters" : "No properties are listed yet"}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              {activeFilters
                ? "Try a nearby locality, a wider budget, or remove one of the score filters."
                : "Be the first to add an available room, shared flat, or PG. Published listings appear here automatically."}
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              {activeFilters ? (
                <Link href="/rooms" className={buttonVariants({ variant: "outline" })}>Clear filters</Link>
              ) : null}
              <Link href="/list-property" className={buttonVariants()}>
                <Building2 aria-hidden="true" className="size-4" />
                List a Property
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
