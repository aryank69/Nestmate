import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../lib/chat.ts", import.meta.url), "utf8");
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
  MAX_MESSAGE_LENGTH,
  chatInitials,
  cleanMessageBody,
  mergeMessage,
  normalizeConversationRows,
} = chatModule.exports;

test("conversation rows normalize unread counts from Postgres bigint values", () => {
  const [conversation] = normalizeConversationRows([
    {
      conversation_id: "conversation-1",
      other_user_id: "user-2",
      other_auth_user_id: "auth-2",
      other_name: "Nisha Rao",
      other_profession: "Engineer",
      last_message: "Hello",
      last_message_at: "2026-08-25T10:00:00.000Z",
      unread_count: "3",
    },
  ]);

  assert.equal(conversation.unreadCount, 3);
  assert.equal(conversation.otherUser.id, "user-2");
  assert.equal(conversation.otherUser.name, "Nisha Rao");
});

test("realtime messages merge once and remain chronologically ordered", () => {
  const later = {
    id: "message-2",
    conversationId: "conversation-1",
    senderId: "user-2",
    body: "Later",
    createdAt: "2026-08-25T10:01:00.000Z",
  };
  const earlier = {
    ...later,
    id: "message-1",
    body: "Earlier",
    createdAt: "2026-08-25T10:00:00.000Z",
  };

  const merged = mergeMessage(mergeMessage([], later), earlier);
  const duplicate = mergeMessage(merged, earlier);

  assert.deepEqual(
    merged.map((message) => message.id),
    ["message-1", "message-2"],
  );
  assert.equal(duplicate.length, 2);
});

test("message bodies are trimmed and capped at the database limit", () => {
  const message = cleanMessageBody(`  ${"a".repeat(MAX_MESSAGE_LENGTH + 50)}  `);

  assert.equal(message.length, MAX_MESSAGE_LENGTH);
  assert.equal(message[0], "a");
});

test("chat initials use at most two name parts", () => {
  assert.equal(chatInitials("Nisha A Rao"), "NA");
  assert.equal(chatInitials("  Kabir  "), "K");
});
