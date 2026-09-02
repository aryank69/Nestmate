import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/community-chat.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const chatModule = { exports: {} };

new Function("module", "exports", "require", compiled)(
  chatModule,
  chatModule.exports,
  require,
);

const {
  MAX_COMMUNITY_MESSAGE_LENGTH,
  cleanCommunityMessageBody,
  formatCommunityMessageDate,
  isCommunityChatNearBottom,
  mergeCommunityChatMessage,
  nextCommunityUnreadCount,
  normalizeCommunityChatMessages,
  shouldShowCommunityDateSeparator,
} = chatModule.exports;

const row = {
  message_id: "00000000-0000-4000-8000-000000000001",
  community_id: "community-1",
  sender_id: "user-1",
  sender_name: "Nisha Rao",
  sender_profession: "Engineer",
  message_body: "Hello HSR",
  reply_to_id: null,
  reply_sender_name: null,
  reply_body: null,
  created_at: "2026-08-31T10:00:00.000Z",
};

test("community chat rows retain safe sender profile fields", () => {
  const [message] = normalizeCommunityChatMessages([row]);

  assert.equal(message.sender.name, "Nisha Rao");
  assert.equal(message.sender.profession, "Engineer");
  assert.equal(message.communityId, "community-1");
});

test("community chat rows retain structured reply previews", () => {
  const [message] = normalizeCommunityChatMessages([
    {
      ...row,
      reply_to_id: "00000000-0000-4000-8000-000000000099",
      reply_sender_name: "Kabir Shah",
      reply_body: "Is the room still available?",
    },
  ]);

  assert.deepEqual(message.replyTo, {
    id: "00000000-0000-4000-8000-000000000099",
    senderName: "Kabir Shah",
    body: "Is the room still available?",
  });
});

test("realtime community messages merge once in timestamp order", () => {
  const [later] = normalizeCommunityChatMessages([
    { ...row, message_id: "message-2", created_at: "2026-08-31T10:01:00.000Z" },
  ]);
  const [earlier] = normalizeCommunityChatMessages([
    { ...row, message_id: "message-1" },
  ]);

  const merged = mergeCommunityChatMessage(
    mergeCommunityChatMessage([], later),
    earlier,
  );
  const duplicate = mergeCommunityChatMessage(merged, earlier);

  assert.deepEqual(
    merged.map((message) => message.id),
    ["message-1", "message-2"],
  );
  assert.equal(duplicate.length, 2);
});

test("unread count grows only for another sender outside the chat tab", () => {
  assert.equal(
    nextCommunityUnreadCount({
      current: 2,
      isChatActive: false,
      currentUserId: "user-1",
      senderId: "user-2",
    }),
    3,
  );
  assert.equal(
    nextCommunityUnreadCount({
      current: 2,
      isChatActive: true,
      currentUserId: "user-1",
      senderId: "user-2",
    }),
    2,
  );
  assert.equal(
    nextCommunityUnreadCount({
      current: 2,
      isChatActive: false,
      currentUserId: "user-1",
      senderId: "user-1",
    }),
    2,
  );
});

test("community message bodies are trimmed and capped", () => {
  const body = cleanCommunityMessageBody(
    `  ${"a".repeat(MAX_COMMUNITY_MESSAGE_LENGTH + 50)}  `,
  );

  assert.equal(body.length, MAX_COMMUNITY_MESSAGE_LENGTH);
  assert.equal(body[0], "a");
});

test("date separators appear for the first message and when the day changes", () => {
  assert.equal(
    shouldShowCommunityDateSeparator("2026-08-31T10:00:00.000Z"),
    true,
  );
  assert.equal(
    shouldShowCommunityDateSeparator(
      "2026-08-31T18:00:00.000Z",
      "2026-08-31T10:00:00.000Z",
    ),
    false,
  );
  assert.equal(
    shouldShowCommunityDateSeparator(
      "2026-09-01T10:00:00.000Z",
      "2026-08-31T18:00:00.000Z",
    ),
    true,
  );
});

test("date labels distinguish today, yesterday, and older days", () => {
  const now = new Date(2026, 8, 1, 12);

  assert.equal(
    formatCommunityMessageDate(new Date(2026, 8, 1, 9).toISOString(), now),
    "Today",
  );
  assert.equal(
    formatCommunityMessageDate(new Date(2026, 7, 31, 9).toISOString(), now),
    "Yesterday",
  );
  assert.match(
    formatCommunityMessageDate(new Date(2026, 7, 25, 9).toISOString(), now),
    /25 August/,
  );
});

test("the chat follows messages only when the viewport is near the bottom", () => {
  assert.equal(
    isCommunityChatNearBottom({
      scrollHeight: 1000,
      scrollTop: 620,
      clientHeight: 300,
    }),
    true,
  );
  assert.equal(
    isCommunityChatNearBottom({
      scrollHeight: 1000,
      scrollTop: 400,
      clientHeight: 300,
    }),
    false,
  );
});
