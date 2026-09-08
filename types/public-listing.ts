import type { ListingImage } from "@/types/community";
import type { TrustScore } from "@/types/trust";
import type { VerificationSummary } from "@/types/verification";
import type { ListingRealityScore } from "@/types/listing-reality";

export type PublicListingCategory = "Room Available" | "PG Available";

export type PublicListingDetail = {
  label: string;
  value: string;
};

export type PublicListing = {
  id: string;
  category: PublicListingCategory;
  seoTitle: string;
  city: string;
  citySlug: string;
  locality: string;
  localitySlug: string;
  priceLabel: string;
  availableFrom: string;
  images: ListingImage[];
  amenities: string[];
  details: PublicListingDetail[];
  availability: {
    status: "AVAILABLE" | "RESERVED";
    label: string;
    isStale: boolean;
    freshnessLabel: string;
  };
  verification: VerificationSummary;
  trust: TrustScore;
  reality: ListingRealityScore;
  publishedAt: string;
  updatedAt: string;
};

export type PublicListingSitemapEntry = {
  id: string;
  updatedAt: Date;
};
