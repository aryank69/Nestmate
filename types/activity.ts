export type InterestTargetType = "LISTING" | "FLATMATE";

export type InterestStage =
  | "INTERESTED"
  | "CONTACTED"
  | "VISIT_PLANNED"
  | "SHORTLISTED"
  | "FINALIZED"
  | "NOT_INTERESTED";

export type ActivitySource = "MANUAL" | "SAVED" | "CHAT" | "VISIT";

export type ActivityFilters = {
  stage: InterestStage | null;
  targetType: InterestTargetType | null;
};

export type ActivitySignal = {
  targetType: InterestTargetType;
  targetId: string;
  stage: InterestStage;
  source: ActivitySource;
  occurredAt: string;
};

export type ActivityItem = ActivitySignal & {
  title: string;
  subtitle: string;
  detail: string;
  href: string;
  moveInChecklistId: string | null;
};

export type ProgressVisitSignal = {
  targetId: string;
  status: "PENDING" | "PROPOSED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  scheduledAt: string | null;
  hasOutcome: boolean;
  attendanceConfirmation?: "HAPPENED" | "MISSED" | "CANCELLED" | null;
};

export type ProgressMetrics = {
  activeOptions: number;
  contacted: number;
  visitsPlanned: number;
  visitsCompleted: number;
  shortlisted: number;
  finalized: number;
  dropped: number;
};

export type ActivityActionState = {
  success: boolean;
  message: string;
  stage?: InterestStage;
};

export type ActivityData = {
  items: ActivityItem[];
  timeline: ActivityItem[];
  progress: ProgressMetrics;
  counts: Record<InterestStage, number>;
  error: string;
};
