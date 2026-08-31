import type { CompatibilityProfile } from "@/types/compatibility";

export type CommunityPostCategory =
  | "Need a Room"
  | "Room Available"
  | "Need Flatmate"
  | "PG Available";

export type CommunityPost = {
  id: string;
  author: {
    name: string;
    initials: string;
    role: string;
    verified?: boolean;
    compatibilityProfile?: CompatibilityProfile;
  };
  city: string;
  locality: string;
  category: CommunityPostCategory;
  title: string;
  description: string;
  priceLabel: string;
  moveInDate: string;
  tags: string[];
  postedAt: string;
  isOwner: boolean;
};

export type CommunityLocationOption = {
  id: string;
  name: string;
  description: string | null;
  city: string;
  citySlug: string;
  locality: string;
  localitySlug: string;
  memberCount: number;
  postCount: number;
};

export type CommunityPostFormValues = {
  postType: string;
  communityId: string;
  title: string;
  amount: string;
  moveInDate: string;
  genderPreference: string;
  housingType: string;
  housingFeature: string;
  description: string;
  tags: string;
};

export type CommunityPostFormField = keyof CommunityPostFormValues;

export type CommunityPostFormInitial = CommunityPostFormValues & {
  id: string;
};

export type CommunityPostActionState = {
  success: boolean;
  message: string;
  postId?: string;
  communityPath?: string;
  fieldErrors?: Partial<Record<CommunityPostFormField, string>>;
};

export type CommunityJoinActionState = {
  success: boolean;
  message: string;
};
