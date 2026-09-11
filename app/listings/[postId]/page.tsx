import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  IndianRupee,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PostImageGallery } from "@/components/community/post-image-gallery";
import { MoveInReadinessIndicator } from "@/components/listings/move-in-readiness-indicator";
import { ListingDecisionPanel } from "@/components/listings/listing-decision-panel";
import { Navbar } from "@/components/navbar";
import { TrustScoreIndicator } from "@/components/trust/trust-score-indicator";
import { ListingRealityScoreIndicator } from "@/components/trust/listing-reality-score";
import { buttonVariants } from "@/components/ui/button";
import { TrustBadges } from "@/components/verification/trust-badges";
import { loadPublicListing } from "@/lib/public-listing-data";
import {
  publicListingMetadataDescription,
  publicListingUrl,
} from "@/lib/public-listings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PublicListingPageProps = {
  params: Promise<{ postId: string }>;
};

export async function generateMetadata({
  params,
}: PublicListingPageProps): Promise<Metadata> {
  const { postId } = await params;
  const listing = await loadPublicListing(postId);
  if (!listing) {
    return {
      title: "Listing unavailable | Roomzi",
      robots: { index: false, follow: false },
    };
  }

  const title = `${listing.seoTitle} | Roomzi`;
  const description = publicListingMetadataDescription({
    category: listing.category,
    locality: listing.locality,
    city: listing.city,
    priceLabel: listing.priceLabel,
    availabilityLabel: listing.availability.label,
    amenities: listing.amenities,
  });
  const canonical = publicListingUrl(listing.id);
  const images = listing.images.map(({ url }) => ({
    url,
    alt: `${listing.category} in ${listing.locality}, ${listing.city}`,
  }));

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: "Roomzi",
      locale: "en_IN",
      title,
      description,
      url: canonical,
      publishedTime: listing.publishedAt,
      modifiedTime: listing.updatedAt,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images: images.map(({ url }) => url),
    },
  };
}

export default async function PublicListingPage({
  params,
}: PublicListingPageProps) {
  const { postId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub ?? null;
  const listing = await loadPublicListing(postId, authUserId);
  if (!listing) notFound();

  const communityHref = `/community/${encodeURIComponent(listing.citySlug)}/${encodeURIComponent(listing.localitySlug)}`;
  const privateDetailPath = `/community/post/${encodeURIComponent(listing.id)}`;
  const authNext = encodeURIComponent(privateDetailPath);

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/20">
        <div className="content-shell py-7 sm:py-11">
          <div className="mx-auto max-w-6xl">
            <Link
              href={communityHref}
              className={cn(buttonVariants({ variant: "ghost" }), "mb-5 px-0")}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Explore {listing.locality}
            </Link>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
              <article className="surface-card overflow-hidden p-5 sm:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1 text-xs font-semibold text-primary">
                    {listing.category}
                  </span>
                  <span className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    listing.availability.status === "AVAILABLE"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}>
                    {listing.availability.label}
                  </span>
                  {listing.availability.isStale ? (
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
                      Needs reconfirmation
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-4 text-2xl font-bold tracking-[-0.035em] text-balance sm:text-4xl">
                  {listing.seoTitle}
                </h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin aria-hidden="true" className="size-4 text-primary" />
                  {listing.locality}, {listing.city}
                </p>

                <PostImageGallery
                  images={listing.images}
                  title={listing.seoTitle}
                  detail
                />

                <dl className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <IndianRupee aria-hidden="true" className="size-4 text-primary" /> Rent
                    </dt>
                    <dd className="mt-2 font-bold">{listing.priceLabel}</dd>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarDays aria-hidden="true" className="size-4 text-primary" /> Available from
                    </dt>
                    <dd className="mt-2 font-bold">{listing.availableFrom}</dd>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Sparkles aria-hidden="true" className="size-4 text-primary" /> Freshness
                    </dt>
                    <dd className="mt-2 text-sm font-semibold">{listing.availability.freshnessLabel}</dd>
                  </div>
                </dl>

                <ListingDecisionPanel
                  livingFit={null}
                  reality={listing.reality}
                  readiness={listing.readiness}
                  localityPulse={listing.localityPulse}
                  locality={listing.locality}
                  className="mt-6"
                />

                {listing.details.length ? (
                  <section className="mt-6">
                    <h2 className="text-lg font-bold">Property details</h2>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      {listing.details.map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between gap-4 rounded-xl border border-border/65 px-3.5 py-3">
                          <dt className="text-sm text-muted-foreground">{label}</dt>
                          <dd className="text-right text-sm font-semibold">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}

                <section className="mt-6">
                  <h2 className="text-lg font-bold">Amenities</h2>
                  {listing.amenities.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {listing.amenities.map((amenity) => (
                        <li key={amenity} className="rounded-full border border-primary/15 bg-primary/[0.05] px-3 py-1.5 text-sm font-medium">
                          {amenity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No amenities have been added yet.</p>
                  )}
                </section>

                <section className="mt-6 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck aria-hidden="true" className="size-4 text-primary" /> Verification and trust
                  </div>
                  <TrustBadges
                    verification={listing.verification}
                    showDisclaimer
                    className="mt-3"
                  />
                  <TrustScoreIndicator
                    value={listing.trust}
                    scope="listing"
                    details
                    className="mt-3"
                  />
                </section>

                <section className="mt-6">
                  <h2 className="text-lg font-bold">Move-in Readiness</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    How actionable and reliably prepared this listing appears right now.
                  </p>
                  <MoveInReadinessIndicator
                    value={listing.readiness}
                    details
                    className="mt-3"
                  />
                </section>

                <section className="mt-6">
                  <h2 className="text-lg font-bold">Listing Reality Score</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    How closely this listing matched what verified visitors found in person.
                  </p>
                  <ListingRealityScoreIndicator
                    value={listing.reality}
                    details
                    className="mt-3"
                  />
                </section>
              </article>

              <aside className="surface-card p-5 lg:sticky lg:top-24">
                <p className="text-sm font-bold">Interested in this place?</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sign in to view the member’s contact options, message privately, or request a visit.
                </p>
                {authUserId ? (
                  <Link href={privateDetailPath} className={cn(buttonVariants({ size: "lg" }), "mt-5 w-full")}>
                    View and contact <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : (
                  <div className="mt-5 grid gap-2">
                    <Link href={`/signup?next=${authNext}`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                      Create account <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <Link href={`/login?next=${authNext}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                      Log in to contact
                    </Link>
                  </div>
                )}
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Exact location and member details are not shown publicly. Trust signals describe specific checks and are not a guarantee.
                </p>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
