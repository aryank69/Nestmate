import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canAddVisitToCalendar,
  createVisitCalendarEvent,
  visitCalendarFilename,
} from "@/lib/visit-calendar";

function plainResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitId: string }> },
) {
  const { visitId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(visitId)) {
    return plainResponse("That visit is unavailable.", 404);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (error || !authUserId) {
    return plainResponse("Please log in to add this visit to your calendar.", 401);
  }

  const viewer = await prisma.user.findUnique({
    where: { authUserId },
    select: { id: true },
  });
  if (!viewer) return plainResponse("That visit is unavailable.", 404);

  const visit = await prisma.visitRequest.findFirst({
    where: {
      id: visitId,
      status: { in: ["ACCEPTED", "CANCELLED"] },
      scheduledAt: { not: null },
      OR: [{ requesterId: viewer.id }, { ownerId: viewer.id }],
      requester: {
        blocksCreated: { none: { blockedId: viewer.id } },
        blocksReceived: { none: { blockerId: viewer.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
      owner: {
        blocksCreated: { none: { blockedId: viewer.id } },
        blocksReceived: { none: { blockerId: viewer.id } },
        moderationState: { isNot: { status: "SUSPENDED" } },
      },
      post: {
        type: { in: ["ROOM_AVAILABLE", "PG_AVAILABLE"] },
        status: "ACTIVE",
        moderationStatus: "VISIBLE",
        availabilityStatus: { in: ["AVAILABLE", "RESERVED", "CLOSED"] },
        publishedAt: { not: null },
      },
    },
    select: {
      id: true,
      status: true,
      calendarRevision: true,
      updatedAt: true,
      scheduledAt: true,
      post: {
        select: {
          id: true,
          title: true,
          community: {
            select: {
              locality: {
                select: {
                  name: true,
                  city: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    !visit?.scheduledAt ||
    !canAddVisitToCalendar({
      status: visit.status,
      scheduledAt: visit.scheduledAt,
    })
  ) {
    return plainResponse("That calendar event is unavailable.", 404);
  }

  const listingUrl = new URL(
    `/community/post/${encodeURIComponent(visit.post.id)}`,
    request.nextUrl.origin,
  ).toString();
  const calendar = createVisitCalendarEvent({
    visitId: visit.id,
    status: visit.status === "CANCELLED" ? "CANCELLED" : "ACCEPTED",
    revision: visit.calendarRevision,
    updatedAt: visit.updatedAt,
    generatedAt: visit.updatedAt,
    scheduledAt: visit.scheduledAt,
    listingTitle: visit.post.title,
    locality: visit.post.community.locality.name,
    city: visit.post.community.locality.city.name,
    listingUrl,
  });

  return new Response(calendar, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${visitCalendarFilename(visit.scheduledAt)}"`,
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}
