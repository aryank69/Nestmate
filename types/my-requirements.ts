import type { MyListingLifecycleStatus } from "@/types/my-listings";

export type MyRequirementView = {
  id: string;
  title: string;
  kind: "Need a Room" | "Need a Flatmate";
  city: string;
  locality: string;
  budgetLabel: string;
  lifecycleStatus: MyListingLifecycleStatus;
  lifecycleLabel: string;
  metrics: {
    matches: number;
    savesOrInterests: number;
    messages: number;
    recentActivity: number;
  };
  recentActivityLabel: string;
  updatedLabel: string;
  detailHref: string | null;
  editHref: string | null;
  matchesHref: string | null;
  canPause: boolean;
  canReopen: boolean;
  canClose: boolean;
  canDelete: boolean;
};

export type MyRequirementsData = {
  requirements: MyRequirementView[];
  summary: {
    total: number;
    active: number;
    paused: number;
    closed: number;
    matches: number;
  };
};
