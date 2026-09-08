import type { CommutePreference } from "@/types/commute";
import type { VisitOutcomeHistoryItem } from "@/types/visit";
import type { VerificationSummary } from "@/types/verification";

export type LifestylePreferences = {
  diet: string;
  smoking: string;
  drinking: string;
  sleepSchedule: string;
  cleanliness: string;
  pets: string;
  status: string;
};

export type UserProfile = {
  name: string;
  age: number;
  profession: string;
  organization: string;
  preferredLocalities: string[];
  budget: string;
  moveInDate: string;
  bio: string;
  commute: CommutePreference;
  preferences: LifestylePreferences;
  visitOutcomeHistory?: VisitOutcomeHistoryItem[];
  verification: VerificationSummary;
};

export type ProfileUpdateResult = {
  success: boolean;
  message: string;
  profile?: UserProfile;
};
