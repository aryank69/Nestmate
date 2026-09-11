import type { CommunityLocationOption } from "@/types/community";

export type OnboardingIntent =
  | "FIND_ROOM"
  | "FIND_ROOMMATE"
  | "LIST_PROPERTY"
  | "POST_REQUIREMENT";

export type OnboardingDefaults = {
  intent: OnboardingIntent | null;
  communityId: string;
  budgetMin: string;
  budgetMax: string;
  moveInDate: string;
  commuteDestination: string;
  commuteLatitude: string;
  commuteLongitude: string;
  preferredCommuteKm: string;
  isFinished: boolean;
};

export type OnboardingFormValues = Omit<
  OnboardingDefaults,
  "isFinished" | "intent"
> & {
  intent: OnboardingIntent | "";
};

export type OnboardingLocation = Pick<
  CommunityLocationOption,
  "id" | "localityId" | "city" | "citySlug" | "locality"
>;

export type OnboardingActionState = {
  success: boolean;
  message: string;
  errors: Partial<Record<keyof OnboardingFormValues, string>>;
};

export const initialOnboardingActionState: OnboardingActionState = {
  success: false,
  message: "",
  errors: {},
};
