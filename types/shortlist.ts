import type { PeopleDiscoveryProfile } from "@/types/discovery";

export type ShortlistActionState = {
  success: boolean;
  message: string;
  shortlisted?: boolean;
};

export type ShortlistedProfileView = {
  profile: PeopleDiscoveryProfile;
  shortlistedAt: string;
};

export type FlatmateShortlistData = {
  profiles: ShortlistedProfileView[];
  unavailableCount: number;
  error: string;
};

export type FlatmateComparisonSlot = {
  id: string;
  profile: PeopleDiscoveryProfile | null;
  unavailableReason: string | null;
};

export type FlatmateComparisonData = {
  slots: FlatmateComparisonSlot[];
  selectionWasTrimmed: boolean;
  error: string;
};
