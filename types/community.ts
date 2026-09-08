import type { CompatibilityProfile } from "@/types/compatibility";
import type { CommuteSummary } from "@/types/commute";
import type { PropertyMapLocation } from "@/types/map";
import type { RecommendationResult } from "@/types/recommendation";
import type { ResponsivenessIndicator } from "@/types/responsiveness";
import type { ListingAvailabilityStatus } from "@/lib/listing-freshness";
import type { VerificationSummary } from "@/types/verification";
import type { InterestStage } from "@/types/activity";
import type { TrustScore } from "@/types/trust";
import type { ListingRealityScore } from "@/types/listing-reality";

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
    verification: VerificationSummary;
    trust: TrustScore;
    compatibilityProfile?: CompatibilityProfile;
    responsiveness: ResponsivenessIndicator;
  };
  city: string;
  locality: string;
  category: CommunityPostCategory;
  title: string;
  description: string;
  priceLabel: string;
  monthlyAmountMin: number | null;
  monthlyAmountMax: number | null;
  securityDeposit: number | null;
  maintenanceAmount: number | null;
  moveInDate: string;
  moveInDateValue: string | null;
  tags: string[];
  postedAt: string;
  availability: {
    status: ListingAvailabilityStatus;
    label: string;
    isStale: boolean;
    ageDays: number;
    lastConfirmedAt: string;
    freshnessLabel: string;
  };
  images: ListingImage[];
  listingDetails: CommunityListingDetails | null;
  listingLocation: PropertyMapLocation | null;
  commute: CommuteSummary | null;
  recommendation: RecommendationResult | null;
  verification: VerificationSummary;
  trust: TrustScore;
  reality: ListingRealityScore;
  isOwner: boolean;
  isSaved?: boolean;
  activityStage: InterestStage | null;
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
  occupancy: string;
  furnishingStatus: string;
  securityDeposit: string;
  maintenanceAmount: string;
  amenities: string;
  preferredOccupant: string;
  attachedBathroom: string;
  parkingType: string;
  locationLatitude: string;
  locationLongitude: string;
  locationPrecision: string;
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
