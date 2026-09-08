import "server-only";

import { LISTING_IMAGE_BUCKET } from "@/lib/listing-images";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingImage } from "@/types/community";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

export async function createListingImageUrls(
  paths: string[],
  expiresIn = SIGNED_URL_LIFETIME_SECONDS,
): Promise<ListingImage[]> {
  const uniquePaths = [...new Set(paths)].slice(0, 6);
  if (!uniquePaths.length) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(LISTING_IMAGE_BUCKET)
    .createSignedUrls(uniquePaths, expiresIn);

  if (error) {
    console.error("Listing image URL creation failed", error.message);
    return [];
  }

  return uniquePaths.flatMap((path, index) => {
    const signedUrl = data?.[index]?.signedUrl;
    return signedUrl ? [{ path, url: signedUrl }] : [];
  });
}

export async function createListingImageUrlMap(paths: string[]) {
  const images = await createListingImageUrls(paths);
  return new Map(images.map((image) => [image.path, image.url]));
}
