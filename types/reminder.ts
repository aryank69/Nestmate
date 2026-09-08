export type ReminderKind =
  | "UPCOMING_VISIT"
  | "CHAT_FOLLOW_UP"
  | "SHORTLIST_IDLE"
  | "MOVE_IN_APPROACHING";

export type ReminderTargetType =
  | "VISIT"
  | "CONVERSATION"
  | "LISTING"
  | "FLATMATE";

export type ReminderCandidate = {
  reminderKey: string;
  kind: ReminderKind;
  targetType: ReminderTargetType;
  targetId: string;
  title: string;
  description: string;
  href: string;
  dueAt: string;
  sourceUpdatedAt: string;
};

export type ReminderItem = ReminderCandidate & {
  id: string;
  snoozedUntil: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

export type ReminderData = {
  reminders: ReminderItem[];
  activeCount: number;
  error: string;
};

export type ReminderActionState = {
  success: boolean;
  message: string;
};
