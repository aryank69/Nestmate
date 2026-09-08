import type { ListingRealityFeedbackView } from "@/types/listing-reality";

export type VisitRequestStatus =
  | "PENDING"
  | "PROPOSED"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED";

export type VisitRole = "OWNER" | "REQUESTER";

export type VisitOutcomeType =
  | "INTERESTED"
  | "NOT_SUITABLE"
  | "FINALIZED"
  | "NO_SHOW";

export type VisitAttendanceConfirmation =
  | "HAPPENED"
  | "MISSED"
  | "CANCELLED";

export type VisitAttendanceView = {
  checkedInAt: string | null;
  confirmation: VisitAttendanceConfirmation | null;
  confirmedAt: string | null;
};

export type VisitOutcomeView = {
  outcome: VisitOutcomeType;
  privateNote: string | null;
  updatedAt: string;
};

export type VisitFeedbackView = {
  propertyAccuracy: number;
  cleanliness: number;
  communicationQuality: number;
  safetyComfort: number;
  overallExperience: number;
  privateNote: string | null;
  updatedAt: string;
};

export type VisitOutcomeHistoryItem = {
  outcome: VisitOutcomeType;
  category: "Room Available" | "PG Available";
  locality: string;
  monthlyAmountMin: number | null;
  monthlyAmountMax: number | null;
};

export type VisitRequestView = {
  id: string;
  postId: string;
  postTitle: string;
  locality: string;
  counterpartName: string;
  role: VisitRole;
  status: VisitRequestStatus;
  calendarRevision: number;
  changes: {
    revision: number;
    actorRole: string;
    previousStatus: string;
    status: string;
    previousTime: string | null;
    scheduledAt: string | null;
    createdAt: string;
  }[];
  requestedAt: string;
  proposedAt: string | null;
  scheduledAt: string | null;
  note: string | null;
  createdAt: string;
  isPast: boolean;
  myOutcome: VisitOutcomeView | null;
  moveInChecklistId: string | null;
  myFeedback: VisitFeedbackView | null;
  feedbackEligibility: { eligible: boolean; reason: string };
  myRealityFeedback: ListingRealityFeedbackView | null;
  realityFeedbackEligibility: { eligible: boolean; reason: string };
  myAttendance: VisitAttendanceView | null;
  sharedAttendance: {
    bothConfirmed: true;
    counterpartConfirmation: VisitAttendanceConfirmation;
  } | null;
  checkInEligibility: { eligible: boolean; reason: string };
  attendanceEligibility: { eligible: boolean; reason: string };
  availableSlots: string[];
  suggestedSlots: VisitSlotSuggestionView[];
};

export type VisitSlotSuggestionView = {
  startsAt: string;
  score: number;
  reasons: Array<"PREFERRED_DAY" | "PREFERRED_TIME" | "SOONEST_AVAILABLE">;
};

export type VisitAvailabilityRuleView = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type VisitAvailabilityBlockView = {
  id: string;
  startsAt: string;
  endsAt: string;
};

export type VisitAvailabilityView = {
  canManage: boolean;
  rules: VisitAvailabilityRuleView[];
  blocks: VisitAvailabilityBlockView[];
};

export type VisitActionState = {
  success: boolean;
  message: string;
};

export type VisitResponseAction =
  | "ACCEPT"
  | "DECLINE"
  | "PROPOSE"
  | "ACCEPT_PROPOSAL"
  | "DECLINE_PROPOSAL";
