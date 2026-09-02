import type { CommunityPostCategory } from "@/types/community";

export const LISTING_IMAGE_BUCKET = "listing-images";
export const MAX_LISTING_IMAGES = 6;
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
export const LISTING_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const extensionByMimeType: Record<(typeof LISTING_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function supportsListingImages(category: CommunityPostCategory | "") {
  return category === "Room Available" || category === "PG Available";
}

export function validateListingImageFile(file: File): string | null {
  if (!LISTING_IMAGE_TYPES.includes(file.type as (typeof LISTING_IMAGE_TYPES)[number])) {
    return "Choose a JPG, PNG, or WebP image.";
  }

  if (file.size > MAX_LISTING_IMAGE_BYTES) {
    return "Each image must be 5 MB or smaller.";
  }

  if (file.size === 0) return "That image is empty. Choose another file.";
  return null;
}

export function listingImagePath(
  authUserId: string,
  postId: string,
  file: File,
) {
  const extension =
    extensionByMimeType[file.type as (typeof LISTING_IMAGE_TYPES)[number]];
  if (!extension) throw new Error("Unsupported image type.");
  return `${authUserId}/${postId}/${crypto.randomUUID()}.${extension}`;
}

export function isOwnedListingImagePath(
  path: string,
  authUserId: string,
  postId: string,
) {
  if (path.length > 500) return false;
  const escapedUserId = authUserId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedPostId = postId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escapedUserId}/${escapedPostId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:jpg|jpeg|png|webp)$`,
    "i",
  ).test(path);
}
