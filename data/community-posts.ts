import type { CommunityPostCategory } from "@/types/community";

export const communityCategories = [
  "All Posts",
  "Need a Room",
  "Room Available",
  "Need Flatmate",
  "PG Available",
] as const;

export type CommunityCategory = (typeof communityCategories)[number];

export function isPostCategory(
  category: CommunityCategory,
): category is CommunityPostCategory {
  return category !== "All Posts";
}
