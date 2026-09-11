import type { MetadataRoute } from "next";

import { loadPublicListingSitemapEntries } from "@/lib/public-listing-data";
import { roomziSiteUrl, publicListingUrl } from "@/lib/public-listings";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await loadPublicListingSitemapEntries();
  return [
    {
      url: roomziSiteUrl(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...listings.map((listing) => ({
      url: publicListingUrl(listing.id),
      lastModified: listing.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
