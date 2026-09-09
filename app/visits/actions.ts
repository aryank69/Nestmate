"use server";

import { revalidatePath } from "next/cache";

import { trackProductAnalyticsEvent } from "@/lib/analytics.server";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/profile-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  formatVisitConflictMessage,
  visitListingEligibility,
} from "@/lib/visit-conflicts";
import {
  intervalsOverlap,
  normalizeVisitSlotPreference,
} from "@/lib/visit-availability";
import { loadOwnerVisitSlots } from "@/lib/visit-availability-data";
import {
  canRespondToVisit,
  cleanVisitNote,
  MAX_VISIT_NOTE_LENGTH,
  parseVisitDate,
  parseVisitResponseAction,
} from "@/lib/visits";
import {
  canRecordVisitOutcome,
  cleanVisitOutcomeNote,
  MAX_VISIT_OUTCOME_NOTE_LENGTH,
  parseVisitOutcome,
} from "@/lib/visit-outcomes";
import {
  parseVisitAttendanceConfirmation,
  visitAttendanceConfirmationEligibility,
  visitCheckInEligibility,
} from "@/lib/visit-attendance";
import {
  canSubmitVisitFeedback,
  cleanVisitFeedbackNote,
  MAX_VISIT_FEEDBACK_NOTE_LENGTH,
  parseVisitFeedbackRatings,
} from "@/lib/visit-feedback";
import {
  canSubmitListingRealityFeedback,
  cleanListingRealityNote,
  MAX_LISTING_REALITY_NOTE_LENGTH,
  parseListingRealityRatings,
} from "@/lib/listing-reality";
import type { VisitActionState } from "@/types/visit";

async function authenticatedVisitContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const metadata = claims.user_metadata;
  const user = await ensureUserProfile({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    name:
      metadata && typeof metadata.full_name === "string"
        ? metadata.full_name
        : null,
  });
  return { supabase, user };
}

function validVisitId(value: string) {
  const id = value.trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function refreshVisitPaths(postId: string) {
  revalidatePath("/reminders");
  revalidatePath("/visits");
  revalidatePath("/activity");
  revalidatePath("/progress");
  revalidatePath("/notifications");
  revalidatePath(`/community/post/${postId}`);
}

async function attendanceVisitContext(visitId: string, userId: string) {
  return prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      OR: [{ ownerId: userId }, { requesterId: userId }],
      requester: {
        blocksCreated: { none: { blockedId: userId } },
        blocksReceived: { none: { blockerId: userId } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
      owner: {
        blocksCreated: { none: { blockedId: userId } },
        blocksReceived: { none: { blockerId: userId } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
    },
    select: {
      id: true,
      ownerId: true,
      postId: true,
      status: true,
      scheduledAt: true,
      post: {
        select: {
          status: true,
          moderationStatus: true,
          availabilityStatus: true,
          publishedAt: true,
        },
      },
      attendances: {
        where: { userId },
        select: { id: true, checkedInAt: true, confirmation: true },
        take: 1,
      },
    },
  });
}

export async function markVisitCheckInAction(input: {
  visitId: string;
}): Promise<VisitActionState> {
  const visitId = validVisitId(input.visitId);
  const context = await authenticatedVisitContext();
  if (!visitId || !context) {
    return { success: false, message: "Please log in to check in for this visit." };
  }
  const visit = await attendanceVisitContext(visitId, context.user.id);
  if (!visit) {
    return { success: false, message: "This visit is unavailable." };
  }
  const existing = visit.attendances[0];
  if (existing?.checkedInAt) {
    return { success: true, message: "You are already checked in." };
  }
  if (existing?.confirmation) {
    return { success: false, message: "Arrival check-in closed after final attendance confirmation." };
  }
  const eligibility = visitCheckInEligibility(visit);
  if (!eligibility.eligible) {
    return { success: false, message: eligibility.reason };
  }
  const now = new Date().toISOString();
  const request = existing
    ? context.supabase
        .from("VisitAttendance")
        .update({ checkedInAt: now })
        .eq("id", existing.id)
        .select("id")
        .maybeSingle()
    : context.supabase
        .from("VisitAttendance")
        .insert({
          id: crypto.randomUUID(),
          visitId: visit.id,
          userId: context.user.id,
          checkedInAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .select("id")
        .maybeSingle();
  const { data, error } = await request;
  if (error || !data) {
    console.error("[visits:check-in] Write failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message:
        error?.code === "22023"
          ? "The check-in window is not open or this listing is unavailable."
          : "We could not save your check-in. Please try again.",
    };
  }
  refreshVisitPaths(visit.postId);
  return {
    success: true,
    message: "You are checked in. No location or GPS data was collected.",
  };
}

export async function confirmVisitAttendanceAction(input: {
  visitId: string;
  confirmation: string;
}): Promise<VisitActionState> {
  const visitId = validVisitId(input.visitId);
  const confirmation = parseVisitAttendanceConfirmation(input.confirmation);
  const context = await authenticatedVisitContext();
  if (!visitId || !confirmation || !context) {
    return { success: false, message: "Choose a valid attendance confirmation." };
  }
  const visit = await attendanceVisitContext(visitId, context.user.id);
  if (!visit) {
    return { success: false, message: "This visit is unavailable." };
  }
  const existing = visit.attendances[0];
  if (existing?.confirmation) {
    return { success: false, message: "Your final attendance is already confirmed." };
  }
  const eligibility = visitAttendanceConfirmationEligibility(visit);
  if (!eligibility.eligible) {
    return { success: false, message: eligibility.reason };
  }
  const now = new Date().toISOString();
  const request = existing
    ? context.supabase
        .from("VisitAttendance")
        .update({ confirmation, confirmedAt: now })
        .eq("id", existing.id)
        .select("id")
        .maybeSingle()
    : context.supabase
        .from("VisitAttendance")
        .insert({
          id: crypto.randomUUID(),
          visitId: visit.id,
          userId: context.user.id,
          confirmation,
          confirmedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .select("id")
        .maybeSingle();
  const { data, error } = await request;
  if (error || !data) {
    console.error("[visits:attendance] Write failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message:
        error?.code === "22023"
          ? "Attendance can be confirmed only after the scheduled visit ends."
          : "We could not save your attendance. Please try again.",
    };
  }
  if (confirmation === "HAPPENED") {
    await trackProductAnalyticsEvent(context.user.id, {
      name: "VISIT_COMPLETED",
      properties: {
        participantRole:
          visit.ownerId === context.user.id ? "owner" : "requester",
      },
    });
  }
  refreshVisitPaths(visit.postId);
  return {
    success: true,
    message:
      confirmation === "HAPPENED"
        ? "Attendance confirmed. You can now record your private visit outcome."
        : "Your final attendance was saved privately.",
  };
}

export async function recordVisitFeedbackAction(input: {
  visitId: string;
  propertyAccuracy: number;
  cleanliness: number;
  communicationQuality: number;
  safetyComfort: number;
  overallExperience: number;
  privateNote: string;
}): Promise<VisitActionState> {
  const visitId = validVisitId(input.visitId);
  const ratings = parseVisitFeedbackRatings(input);
  if (!visitId || !ratings) {
    return { success: false, message: "Rate every feedback category from 1 to 5." };
  }
  if (
    typeof input.privateNote !== "string" ||
    input.privateNote.trim().length > MAX_VISIT_FEEDBACK_NOTE_LENGTH
  ) {
    return { success: false, message: "Keep your private note within 1000 characters." };
  }

  const context = await authenticatedVisitContext();
  if (!context) {
    return { success: false, message: "Please log in to save visit feedback." };
  }
  const visit = await prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      OR: [
        { ownerId: context.user.id },
        { requesterId: context.user.id },
      ],
      requester: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
      owner: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
    },
    select: {
      id: true,
      postId: true,
      status: true,
      scheduledAt: true,
      attendances: {
        where: { userId: context.user.id },
        select: { confirmation: true },
        take: 1,
      },
      outcomes: {
        where: { userId: context.user.id },
        select: { outcome: true },
        take: 1,
      },
      feedback: {
        where: { userId: context.user.id },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!visit) {
    return { success: false, message: "This visit is unavailable." };
  }
  const eligibility = canSubmitVisitFeedback({
    status: visit.status,
    scheduledAt: visit.scheduledAt,
    attendanceConfirmation: visit.attendances[0]?.confirmation,
    outcome: visit.outcomes[0]?.outcome,
    hasExistingFeedback: Boolean(visit.feedback[0]),
  });
  if (!eligibility.eligible) {
    return { success: false, message: eligibility.reason };
  }

  const now = new Date().toISOString();
  const values = {
    ...ratings,
    privateNote: cleanVisitFeedbackNote(input.privateNote),
    updatedAt: now,
  };
  const request = visit.feedback[0]
    ? context.supabase
        .from("VisitFeedback")
        .update(values)
        .eq("id", visit.feedback[0].id)
        .eq("userId", context.user.id)
        .select("id")
        .maybeSingle()
    : context.supabase
        .from("VisitFeedback")
        .insert({
          id: crypto.randomUUID(),
          visitId: visit.id,
          userId: context.user.id,
          ...values,
          createdAt: now,
        })
        .select("id")
        .maybeSingle();
  const { data, error } = await request;
  if (error || !data) {
    console.error("[visits:feedback] Write failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message:
        error?.code === "22023" || error?.code === "23514"
          ? "Check each rating and keep the private note within 1000 characters."
          : "We could not save your private feedback. Please try again.",
    };
  }
  refreshVisitPaths(visit.postId);
  return {
    success: true,
    message: visit.feedback[0]
      ? "Your private visit feedback was updated."
      : "Your private visit feedback was saved.",
  };
}

export async function recordListingRealityFeedbackAction(input: {
  visitId: string;
  photosAccuracy: number;
  costAccuracy: number;
  amenitiesAccuracy: number;
  conditionAccuracy: number;
  locationAccuracy: number;
  descriptionAccuracy: number;
  privateNote: string;
}): Promise<VisitActionState> {
  const visitId = validVisitId(input.visitId);
  const ratings = parseListingRealityRatings(input);
  if (!visitId || !ratings) {
    return { success: false, message: "Rate every listing category from 1 to 5." };
  }
  if (
    typeof input.privateNote !== "string" ||
    input.privateNote.trim().length > MAX_LISTING_REALITY_NOTE_LENGTH
  ) {
    return { success: false, message: "Keep your private note within 1000 characters." };
  }

  const context = await authenticatedVisitContext();
  if (!context) {
    return { success: false, message: "Please log in to rate this listing." };
  }
  const visit = await prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      requesterId: context.user.id,
      ownerId: { not: context.user.id },
      requester: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
      owner: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
      post: {
        type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
        authorId: { not: context.user.id },
      },
    },
    select: {
      id: true,
      postId: true,
      requesterId: true,
      ownerId: true,
      status: true,
      scheduledAt: true,
      attendances: {
        select: { userId: true, confirmation: true },
      },
      realityFeedback: {
        select: { id: true, reviewerId: true },
      },
    },
  });
  if (!visit) {
    return {
      success: false,
      message: "Only a verified visitor can rate this listing.",
    };
  }

  const eligibility = canSubmitListingRealityFeedback({
    role: "REQUESTER",
    status: visit.status,
    scheduledAt: visit.scheduledAt,
    requesterAttendance: visit.attendances.find(
      ({ userId }) => userId === visit.requesterId,
    )?.confirmation,
    ownerAttendance: visit.attendances.find(
      ({ userId }) => userId === visit.ownerId,
    )?.confirmation,
    hasExistingFeedback: Boolean(visit.realityFeedback),
  });
  if (!eligibility.eligible) {
    return { success: false, message: eligibility.reason };
  }

  const now = new Date().toISOString();
  const values = {
    ...ratings,
    privateNote: cleanListingRealityNote(input.privateNote),
    updatedAt: now,
  };
  const request = visit.realityFeedback
    ? context.supabase
        .from("ListingRealityFeedback")
        .update(values)
        .eq("id", visit.realityFeedback.id)
        .eq("reviewerId", context.user.id)
        .select("id")
        .maybeSingle()
    : context.supabase
        .from("ListingRealityFeedback")
        .insert({
          id: crypto.randomUUID(),
          visitId: visit.id,
          postId: visit.postId,
          reviewerId: context.user.id,
          ...values,
          createdAt: now,
        })
        .select("id")
        .maybeSingle();
  const { data, error } = await request;
  if (error || !data) {
    console.error("[visits:listing-reality] Write failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      success: false,
      message:
        error?.code === "22023" || error?.code === "23514"
          ? "Check each rating and keep the private note within 1000 characters."
          : error?.code === "42501"
            ? "Both participants must confirm that this visit happened before you can rate the listing."
            : "We could not save your listing rating. Please try again.",
    };
  }

  refreshVisitPaths(visit.postId);
  revalidatePath(`/listings/${visit.postId}`);
  return {
    success: true,
    message: visit.realityFeedback
      ? "Your verified listing rating was updated."
      : "Your verified listing rating was saved privately.",
  };
}

async function ownerVisitConflictMessage(
  ownerId: string,
  requestedAt: Date,
  excludedVisitId?: string,
) {
  const slots = await loadOwnerVisitSlots(ownerId, { excludedVisitId });
  if (slots.includes(requestedAt.toISOString())) return null;
  const alternatives = slots
    .map((slot) => new Date(slot))
    .sort(
      (first, second) =>
        Math.abs(first.getTime() - requestedAt.getTime()) -
        Math.abs(second.getTime() - requestedAt.getTime()),
    )
    .slice(0, 3);
  return alternatives.length
    ? formatVisitConflictMessage(alternatives)
    : "That time is unavailable. The owner has no open visit slots in the next three weeks.";
}

async function canManageVisitAvailability(userId: string) {
  return Boolean(
    await prisma.post.findFirst({
      where: { authorId: userId, type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] } },
      select: { id: true },
    }),
  );
}

export async function saveVisitAvailabilityAction(input: {
  rules: Array<{ weekday: number; startMinute: number; endMinute: number }>;
}): Promise<VisitActionState> {
  const context = await authenticatedVisitContext();
  if (!context) return { success: false, message: "Please log in to manage visit availability." };
  if (!(await canManageVisitAvailability(context.user.id))) {
    return { success: false, message: "Create a Room Available or PG Available listing before setting visit availability." };
  }
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const weekdays = new Set<number>();
  const valid = rules.length <= 7 && rules.every((rule) => {
    const isValid =
      Number.isSafeInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6 &&
      Number.isSafeInteger(rule.startMinute) && rule.startMinute >= 0 && rule.startMinute <= 1380 &&
      Number.isSafeInteger(rule.endMinute) && rule.endMinute >= 60 && rule.endMinute <= 1440 &&
      rule.endMinute - rule.startMinute >= 60 && !weekdays.has(rule.weekday);
    weekdays.add(rule.weekday);
    return isValid;
  });
  if (!valid) {
    return { success: false, message: "Each selected day needs one valid availability window of at least one hour." };
  }
  const { error } = await context.supabase.rpc("replace_visit_availability", {
    schedule_rules: rules,
  });
  if (error) {
    return { success: false, message: "We could not save your weekly availability. Please try again." };
  }
  revalidatePath("/visits");
  return {
    success: true,
    message: rules.length ? "Weekly visit availability saved." : "Weekly visit availability cleared.",
  };
}

export async function addVisitAvailabilityBlockAction(input: {
  startsAt: string;
  endsAt: string;
}): Promise<VisitActionState> {
  const startsAt = parseVisitDate(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!startsAt || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 7 * 24 * 60 * 60_000) {
    return { success: false, message: "Choose a future blocked period, no longer than seven days." };
  }
  const context = await authenticatedVisitContext();
  if (!context || !(await canManageVisitAvailability(context.user.id))) {
    return { success: false, message: "You cannot manage visit availability for these listings." };
  }
  const accepted = await prisma.visitRequest.findMany({
    where: {
      ownerId: context.user.id,
      status: "ACCEPTED",
      scheduledAt: { lt: endsAt, gte: new Date(startsAt.getTime() - 60 * 60_000) },
    },
    select: { scheduledAt: true },
  });
  if (accepted.some(({ scheduledAt }) => scheduledAt && intervalsOverlap(
    startsAt, endsAt, scheduledAt, new Date(scheduledAt.getTime() + 60 * 60_000),
  ))) {
    return { success: false, message: "That blocked period overlaps a confirmed visit. Reschedule or cancel that visit first." };
  }
  const { error } = await context.supabase.from("VisitAvailabilityBlock").insert({
    id: crypto.randomUUID(),
    ownerId: context.user.id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (error) {
    return {
      success: false,
      message: error.code === "23P01"
        ? "That blocked period overlaps a confirmed visit. Reschedule or cancel that visit first."
        : "We could not add that blocked time. Please try again.",
    };
  }
  revalidatePath("/visits");
  return { success: true, message: "Blocked time added." };
}

export async function removeVisitAvailabilityBlockAction(input: {
  blockId: string;
}): Promise<VisitActionState> {
  const blockId = validVisitId(input.blockId);
  const context = await authenticatedVisitContext();
  if (!blockId || !context) return { success: false, message: "That blocked time is unavailable." };
  const { data, error } = await context.supabase
    .from("VisitAvailabilityBlock")
    .delete()
    .eq("id", blockId)
    .eq("ownerId", context.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { success: false, message: "That blocked time is unavailable." };
  revalidatePath("/visits");
  return { success: true, message: "Blocked time removed." };
}

export async function changeAcceptedVisitAction(input: {
  visitId: string;
  action: "RESCHEDULE" | "CANCEL";
  scheduledAt?: string;
  revision: number;
}): Promise<VisitActionState> {
  const visitId = typeof input.visitId === "string" ? validVisitId(input.visitId) : null;
  const scheduledAt = input.action === "RESCHEDULE" ? parseVisitDate(input.scheduledAt) : null;
  if (!visitId || !["RESCHEDULE", "CANCEL"].includes(input.action) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      (input.action === "RESCHEDULE" && !scheduledAt)) {
    return { success: false, message: "Choose a valid action and a time at least 30 minutes ahead, within 180 days." };
  }
  const context = await authenticatedVisitContext();
  if (!context) return { success: false, message: "Please log in to manage this visit." };
  const visit = await prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      status: "ACCEPTED",
      calendarRevision: input.revision,
      OR: [{ ownerId: context.user.id }, { requesterId: context.user.id }],
      requester: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
      },
      owner: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
      },
      post: {
        status: "ACTIVE",
        moderationStatus: "VISIBLE",
        availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
        publishedAt: { not: null },
      },
    },
    select: { id: true, postId: true, ownerId: true },
  });
  if (!visit) {
    return {
      success: false,
      message: "This visit changed or is no longer available. Refresh and check its status.",
    };
  }
  if (scheduledAt) {
    const conflict = await ownerVisitConflictMessage(
      visit.ownerId,
      scheduledAt,
      visit.id,
    );
    if (conflict) return { success: false, message: conflict };
  }
  // Participant visibility, immutable fields, scheduling limits and history are enforced by RLS/triggers.
  const { data, error } = await context.supabase
    .from("VisitRequest")
    .update({
      status: input.action === "CANCEL" ? "CANCELLED" : "ACCEPTED",
      ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
    })
    .eq("id", visitId)
    .eq("status", "ACCEPTED")
    .eq("calendarRevision", input.revision)
    .select("postId")
    .maybeSingle();
  if (error || !data) {
    const conflict =
      error?.code === "23P01" && scheduledAt
        ? await ownerVisitConflictMessage(visit.ownerId, scheduledAt, visit.id)
        : null;
    return {
      success: false,
      message:
        conflict ??
        "This visit changed or is no longer available for this action. Refresh and check the confirmed time.",
    };
  }
  refreshVisitPaths(data.postId);
  return { success: true, message: input.action === "CANCEL" ? "Visit cancelled. Both participants have been notified." : "Visit rescheduled. Both participants have been notified." };
}

export async function requestVisitAction(input: {
  postId: string;
  requestedAt: string;
  note: string;
  preferredWeekdays: number[];
  preferredStartMinute: number | null;
  preferredEndMinute: number | null;
}): Promise<VisitActionState> {
  const postId = input.postId.trim();
  const requestedAt = parseVisitDate(input.requestedAt);
  if (!postId || postId.length > 128) {
    return { success: false, message: "Choose a valid listing." };
  }
  if (!requestedAt) {
    return {
      success: false,
      message: "Choose a future visit time within the next 180 days.",
    };
  }
  if (typeof input.note !== "string" || input.note.trim().length > MAX_VISIT_NOTE_LENGTH) {
    return { success: false, message: "Keep your note within 500 characters." };
  }
  const rawWeekdays = Array.isArray(input.preferredWeekdays)
    ? input.preferredWeekdays
    : [];
  const preference = normalizeVisitSlotPreference({
    preferredWeekdays: rawWeekdays,
    preferredStartMinute: input.preferredStartMinute,
    preferredEndMinute: input.preferredEndMinute,
  });
  if (
    !preference ||
    rawWeekdays.length !== new Set(rawWeekdays).size ||
    rawWeekdays.length !== preference.preferredWeekdays.length
  ) {
    return {
      success: false,
      message: "Choose valid preferred days and a time window of at least one hour.",
    };
  }

  const context = await authenticatedVisitContext();
  if (!context) {
    return { success: false, message: "Please log in to request a visit." };
  }

  const listing = await prisma.post.findFirst({
    where: {
      id: postId,
      type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
      authorId: { not: context.user.id },
      author: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
    },
    select: {
      id: true,
      authorId: true,
      type: true,
      status: true,
      moderationStatus: true,
      availabilityStatus: true,
      publishedAt: true,
    },
  });
  if (!listing) {
    return { success: false, message: "This listing is unavailable for visits." };
  }
  const listingError = visitListingEligibility(listing);
  if (listingError) return { success: false, message: listingError };

  const existing = await prisma.visitRequest.findFirst({
    where: {
      postId,
      requesterId: context.user.id,
      status: { in: ["PENDING", "PROPOSED"] },
    },
    select: { id: true },
  });
  if (existing) {
    return { success: false, message: "You already have an open visit request." };
  }
  const conflict = await ownerVisitConflictMessage(
    listing.authorId,
    requestedAt,
  );
  if (conflict) return { success: false, message: conflict };

  const now = new Date().toISOString();
  const visitRequestId = crypto.randomUUID();
  const { error } = await context.supabase.from("VisitRequest").insert({
    id: visitRequestId,
    postId,
    requesterId: context.user.id,
    ownerId: listing.authorId,
    status: "PENDING",
    requestedAt: requestedAt.toISOString(),
    note: cleanVisitNote(input.note),
    createdAt: now,
    updatedAt: now,
  });

  if (error) {
    console.error("[visits:request] Insert failed", {
      code: error.code,
      message: error.message,
    });
    const conflict =
      error.code === "23P01"
        ? await ownerVisitConflictMessage(listing.authorId, requestedAt)
        : null;
    return {
      success: false,
      message:
        conflict ??
        (error.code === "23505"
          ? "You already have an open visit request."
          : "We could not send your visit request. Please try again."),
    };
  }

  await trackProductAnalyticsEvent(context.user.id, {
    name: "VISIT_REQUESTED",
    properties: {
      listingType:
        listing.type === "PG_AVAILABLE" ? "pg-available" : "room-available",
    },
  });

  const hasPreference =
    preference.preferredWeekdays.length > 0 ||
    preference.preferredStartMinute !== null;
  if (hasPreference) {
    const { error: preferenceError } = await context.supabase
      .from("VisitSlotPreference")
      .insert({
        id: crypto.randomUUID(),
        visitId: visitRequestId,
        requesterId: context.user.id,
        preferredWeekdays: preference.preferredWeekdays,
        preferredStartMinute: preference.preferredStartMinute,
        preferredEndMinute: preference.preferredEndMinute,
        createdAt: now,
        updatedAt: now,
      });
    if (preferenceError) {
      console.error("[visits:preference] Insert failed", {
        code: preferenceError.code,
        message: preferenceError.message,
      });
      refreshVisitPaths(postId);
      return {
        success: true,
        message:
          "Your visit request was sent, but the preferred window could not be saved.",
      };
    }
  }

  refreshVisitPaths(postId);
  return { success: true, message: "Your visit request was sent." };
}

export async function respondVisitAction(input: {
  visitId: string;
  action: string;
  proposedAt?: string;
}): Promise<VisitActionState> {
  const visitId = validVisitId(input.visitId);
  const action = parseVisitResponseAction(input.action);
  if (!visitId || !action) {
    return { success: false, message: "Choose a valid visit response." };
  }

  const context = await authenticatedVisitContext();
  if (!context) {
    return { success: false, message: "Please log in to manage visits." };
  }

  const visit = await prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      OR: [{ ownerId: context.user.id }, { requesterId: context.user.id }],
      requester: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
      },
      owner: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
      },
    },
    select: {
      id: true,
      postId: true,
      ownerId: true,
      status: true,
      requestedAt: true,
      proposedAt: true,
    },
  });
  if (!visit) {
    return { success: false, message: "That visit request is unavailable." };
  }

  const role = visit.ownerId === context.user.id ? "OWNER" : "REQUESTER";
  if (!canRespondToVisit({ role, status: visit.status, action })) {
    return { success: false, message: "That visit response is no longer available." };
  }

  const proposedAt = action === "PROPOSE"
    ? parseVisitDate(input.proposedAt)
    : null;
  if (action === "PROPOSE" && !proposedAt) {
    return {
      success: false,
      message: "Choose a future proposed time within the next 180 days.",
    };
  }
  const status =
    action === "ACCEPT" || action === "ACCEPT_PROPOSAL"
      ? "ACCEPTED"
      : action === "DECLINE" || action === "DECLINE_PROPOSAL"
        ? "DECLINED"
        : "PROPOSED";
  const scheduledCandidate =
    action === "PROPOSE"
      ? proposedAt
      : status === "ACCEPTED"
        ? visit.proposedAt ?? visit.requestedAt
        : null;
  if (scheduledCandidate) {
    const conflict = await ownerVisitConflictMessage(
      visit.ownerId,
      scheduledCandidate,
      visit.id,
    );
    if (conflict) return { success: false, message: conflict };
  }

  const { data, error } = await context.supabase
    .from("VisitRequest")
    .update({
      status,
      ...(proposedAt ? { proposedAt: proposedAt.toISOString() } : {}),
      updatedAt: new Date().toISOString(),
    })
    .eq("id", visit.id)
    .eq("status", visit.status)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[visits:respond] Update failed", {
      code: error?.code,
      message: error?.message,
    });
    const conflict =
      error?.code === "23P01" && scheduledCandidate
        ? await ownerVisitConflictMessage(
            visit.ownerId,
            scheduledCandidate,
            visit.id,
          )
        : null;
    return {
      success: false,
      message:
        conflict ??
        "We could not update this visit request. Refresh and try again.",
    };
  }

  refreshVisitPaths(visit.postId);
  return {
    success: true,
    message:
      status === "ACCEPTED"
        ? "The visit is confirmed."
        : status === "DECLINED"
          ? "The visit request was declined."
          : "A new visit time was proposed.",
  };
}

export async function recordVisitOutcomeAction(input: {
  visitId: string;
  outcome: string;
  privateNote: string;
}): Promise<VisitActionState> {
  const visitId = validVisitId(input.visitId);
  const outcome = parseVisitOutcome(input.outcome);
  if (!visitId || !outcome) {
    return { success: false, message: "Choose a valid visit outcome." };
  }
  if (
    typeof input.privateNote !== "string" ||
    input.privateNote.trim().length > MAX_VISIT_OUTCOME_NOTE_LENGTH
  ) {
    return { success: false, message: "Keep your private note within 500 characters." };
  }

  const context = await authenticatedVisitContext();
  if (!context) {
    return { success: false, message: "Please log in to record an outcome." };
  }

  const visit = await prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      status: "ACCEPTED",
      scheduledAt: { lte: new Date() },
      OR: [
        { ownerId: context.user.id },
        { requesterId: context.user.id },
      ],
      requester: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
      },
      owner: {
        blocksCreated: { none: { blockedId: context.user.id } },
        blocksReceived: { none: { blockerId: context.user.id } },
      },
    },
    select: {
      id: true,
      postId: true,
      status: true,
      scheduledAt: true,
      post: {
        select: {
          community: {
            select: {
              locality: {
                select: {
                  slug: true,
                  city: { select: { slug: true } },
                },
              },
            },
          },
        },
      },
      attendances: {
        where: { userId: context.user.id },
        select: { confirmation: true },
        take: 1,
      },
      outcomes: {
        where: { userId: context.user.id },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!visit || !canRecordVisitOutcome(visit)) {
    return {
      success: false,
      message: "Outcomes are available after an accepted visit has taken place.",
    };
  }
  if (
    !visit.outcomes[0] &&
    visit.attendances[0]?.confirmation !== "HAPPENED"
  ) {
    return {
      success: false,
      message: "Confirm that the visit happened before recording an outcome.",
    };
  }

  const { error } = await context.supabase.from("VisitOutcome").upsert(
    {
      visitId: visit.id,
      userId: context.user.id,
      outcome,
      privateNote: cleanVisitOutcomeNote(input.privateNote),
    },
    { onConflict: "visitId,userId" },
  );

  if (error) {
    console.error("[visits:outcome] Upsert failed", {
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      message: "We could not save your private visit outcome. Please try again.",
    };
  }

  if (outcome === "FINALIZED") {
    await trackProductAnalyticsEvent(context.user.id, {
      name: "MATCH_FINALIZED",
      properties: { targetType: "listing" },
    });
  }

  const locality = visit.post.community.locality;
  refreshVisitPaths(visit.postId);
  revalidatePath(`/community/${locality.city.slug}/${locality.slug}`);
  return {
    success: true,
    message:
      outcome === "FINALIZED"
        ? "Outcome saved. The listing availability was updated when appropriate."
        : "Your private visit outcome was saved.",
  };
}
