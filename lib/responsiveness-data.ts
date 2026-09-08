import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateResponsiveness,
  latestDate,
} from "@/lib/responsiveness";
import type { ResponsivenessIndicator } from "@/types/responsiveness";

type UserActivitySeed = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

type ResponseDelayRow = {
  senderId: string;
  responseHours: number | string;
};

const RESPONSE_WINDOW_DAYS = 90;
const MAX_RESPONSE_SAMPLES_PER_USER = 20;

export async function loadResponsivenessByUserIds(
  users: UserActivitySeed[],
): Promise<Map<string, ResponsivenessIndicator>> {
  if (!users.length) return new Map();
  const userIds = [...new Set(users.map(({ id }) => id))];
  const responseWindowStart = new Date(
    Date.now() - RESPONSE_WINDOW_DAYS * 86_400_000,
  );

  const [responseRows, directActivity, communityActivity, listingActivity] =
    await Promise.all([
      prisma.$queryRaw<ResponseDelayRow[]>(Prisma.sql`
        WITH sequenced_messages AS (
          SELECT
            message."senderId",
            message."createdAt",
            lag(message."senderId") OVER (
              PARTITION BY message."conversationId"
              ORDER BY message."createdAt", message."id"
            ) AS previous_sender_id,
            lag(message."createdAt") OVER (
              PARTITION BY message."conversationId"
              ORDER BY message."createdAt", message."id"
            ) AS previous_message_at
          FROM public."Message" AS message
          JOIN public."Conversation" AS conversation
            ON conversation."id" = message."conversationId"
          WHERE message."createdAt" >= ${responseWindowStart}
            AND (
              conversation."participantOneId" IN (${Prisma.join(userIds)})
              OR conversation."participantTwoId" IN (${Prisma.join(userIds)})
            )
        ), ranked_responses AS (
          SELECT
            "senderId",
            EXTRACT(EPOCH FROM ("createdAt" - previous_message_at)) / 3600
              AS response_hours,
            row_number() OVER (
              PARTITION BY "senderId"
              ORDER BY "createdAt" DESC
            ) AS response_rank
          FROM sequenced_messages
          WHERE "senderId" IN (${Prisma.join(userIds)})
            AND previous_sender_id IS NOT NULL
            AND previous_sender_id <> "senderId"
        )
        SELECT
          "senderId",
          response_hours AS "responseHours"
        FROM ranked_responses
        WHERE response_rank <= ${MAX_RESPONSE_SAMPLES_PER_USER}
      `),
      prisma.message.groupBy({
        by: ["senderId"],
        where: { senderId: { in: userIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.communityMessage.groupBy({
        by: ["senderId"],
        where: { senderId: { in: userIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.post.groupBy({
        by: ["authorId"],
        where: {
          authorId: { in: userIds },
          status: "ACTIVE",
          availabilityStatus: { in: ["AVAILABLE", "RESERVED"] },
          publishedAt: { not: null },
        },
        _count: { _all: true },
        _max: { lastConfirmedAt: true },
      }),
    ]);

  const responseDelays = new Map<string, number[]>();
  for (const row of responseRows) {
    const delay = Number(row.responseHours);
    if (!Number.isFinite(delay) || delay < 0) continue;
    responseDelays.set(row.senderId, [
      ...(responseDelays.get(row.senderId) ?? []),
      delay,
    ]);
  }

  const directByUser = new Map(directActivity.map((row) => [row.senderId, row]));
  const communityByUser = new Map(
    communityActivity.map((row) => [row.senderId, row]),
  );
  const listingsByUser = new Map(
    listingActivity.map((row) => [row.authorId, row]),
  );

  return new Map(
    users.map((user) => {
      const direct = directByUser.get(user.id);
      const community = communityByUser.get(user.id);
      const listings = listingsByUser.get(user.id);
      return [
        user.id,
        calculateResponsiveness({
          responseDelayHours: responseDelays.get(user.id) ?? [],
          activityCount:
            (direct?._count._all ?? 0) +
            (community?._count._all ?? 0) +
            (listings?._count._all ?? 0),
          latestActivityAt: latestDate([
            direct?._max.createdAt,
            community?._max.createdAt,
            listings?._max.lastConfirmedAt,
            user.updatedAt,
            user.createdAt,
          ]),
        }),
      ];
    }),
  );
}
