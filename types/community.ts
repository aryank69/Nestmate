import type { CompatibilityProfile } from "@/types/compatibility";

export type CommunityPostCategory =
  | "Need a Room"
  | "Room Available"
  | "Need Flatmate"
  | "PG Available";

export type ListingImage = {
  path: string;
  url: string;
};

export type CommunityListingDetails = {
  furnishing: string | null;
  occupancy: string | null;
  deposit: string | null;
  maintenance: string | null;
  preferredOccupant: string | null;
  roomType: string | null;
  attachedBathroom: string | null;
  parking: string | null;
  amenities: string[];
};

export type CommunityPost = {
  id: string;
  author: {
    id: string;
    authUserId: string;
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
  images: ListingImage[];
  listingDetails: CommunityListingDetails | null;
  isOwner: boolean;
  isSaved?: boolean;
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
  furnishingStatus: string;
  securityDeposit: string;
  maintenanceAmount: string;
  amenities: string;
  preferredOccupant: string;
  attachedBathroom: string;
  parkingType: string;
  description: string;
  tags: string;
};

export type CommunityPostFormField = keyof CommunityPostFormValues;

export type CommunityPostFormInitial = CommunityPostFormValues & {
  id: string;
  images: ListingImage[];
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
