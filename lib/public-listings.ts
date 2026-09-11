import type { PublicListingCategory } from "@/types/public-listing";

export const PUBLIC_LISTING_DATABASE_TYPES = [
  "ROOM_AVAILABLE",
  "PG_AVAILABLE",
] as const;

export type PublicListingEligibility = {
  type: string;
  status: string;
  availabilityStatus: string;
  moderationStatus: string;
  publishedAt: Date | string | null;
  communityActive: boolean;
  authorSuspended: boolean;
  viewerBlocked: boolean;
};

export function isEligiblePublicListing(input: PublicListingEligibility) {
  return (
    PUBLIC_LISTING_DATABASE_TYPES.includes(
      input.type as (typeof PUBLIC_LISTING_DATABASE_TYPES)[number],
    ) &&
    input.status === "ACTIVE" &&
    (input.availabilityStatus === "AVAILABLE" ||
      input.availabilityStatus === "RESERVED") &&
    input.moderationStatus === "VISIBLE" &&
    Boolean(input.publishedAt) &&
    input.communityActive &&
    !input.authorSuspended &&
    !input.viewerBlocked
  );
}

export function publicListingCategory(
  value: (typeof PUBLIC_LISTING_DATABASE_TYPES)[number],
): PublicListingCategory {
  return value === "PG_AVAILABLE" ? "PG Available" : "Room Available";
}

const contactPattern = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9})/i;

export function privacySafeListingTokens(values: string[], limit = 8) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = cleaned.toLocaleLowerCase("en-IN");
    if (!cleaned || contactPattern.test(cleaned) || seen.has(key)) return [];
    seen.add(key);
    return [cleaned];
  }).slice(0, limit);
}

export function publicListingTitle(input: {
  category: PublicListingCategory;
  locality: string;
  city: string;
  furnishing: string | null;
  roomType: string | null;
}) {
  const subject = input.category === "PG Available"
    ? "PG accommodation"
    : input.roomType ?? "Room";
  return [input.furnishing, subject, "in", input.locality, input.city]
    .filter(Boolean)
    .join(" ");
}

export function publicListingMetadataDescription(input: {
  category: PublicListingCategory;
  locality: string;
  city: string;
  priceLabel: string;
  availabilityLabel: string;
  amenities: string[];
}) {
  const amenityText = input.amenities.length
    ? ` Amenities include ${input.amenities.slice(0, 3).join(", ")}.`
    : "";
  return `${input.category} in ${input.locality}, ${input.city}. ${input.priceLabel}. ${input.availabilityLabel}.${amenityText}`
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

export function roomziSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      const validProtocol =
        url.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && url.protocol === "http:");
      if (
        validProtocol &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      ) {
        return url.origin;
      }
    } catch {
      // The explicit production failure below prevents unsafe canonical URLs.
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be a valid HTTPS origin in production.",
    );
  }
  return "http://localhost:3002";
}

export function publicListingUrl(postId: string) {
  return `${roomziSiteUrl()}/listings/${encodeURIComponent(postId)}`;
}
