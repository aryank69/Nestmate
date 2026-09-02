import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../lib/notifications.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const notificationModule = { exports: {} };

new Function("module", "exports", "require", compiled)(
  notificationModule,
  notificationModule.exports,
  require,
);

const {
  formatNotificationTime,
  mergeNotification,
  normalizeNotification,
  unreadNotificationCount,
} = notificationModule.exports;

const notification = {
  id: "notification-1",
  type: "PRIVATE_MESSAGE",
  title: "Nisha sent you a message",
  body: "Is the room available?",
  href: "/chat?conversation=conversation-1",
  resourceId: "message-1",
  readAt: null,
  createdAt: "2026-09-01T10:00:00.000Z",
};

test("notification rows keep only display and navigation fields", () => {
  assert.deepEqual(normalizeNotification(notification), notification);
});

test("realtime notifications merge once and stay newest first", () => {
  const newer = {
    ...notification,
    id: "notification-2",
    createdAt: "2026-09-01T10:01:00.000Z",
  };
  const merged = mergeNotification(
    mergeNotification([], notification),
    newer,
  );
  const updated = mergeNotification(merged, {
    ...notification,
    readAt: "2026-09-01T10:02:00.000Z",
  });

  assert.deepEqual(
    merged.map((item) => item.id),
    ["notification-2", "notification-1"],
  );
  assert.equal(updated.length, 2);
  assert.equal(updated.find((item) => item.id === notification.id).readAt, "2026-09-01T10:02:00.000Z");
});

test("unread counts ignore notifications with a read timestamp", () => {
  assert.equal(
    unreadNotificationCount([
      notification,
      { ...notification, id: "notification-2", readAt: "2026-09-01T10:02:00.000Z" },
    ]),
    1,
  );
});

test("notification times use short relative labels", () => {
  const now = new Date("2026-09-01T10:05:00.000Z");
  assert.equal(formatNotificationTime(notification.createdAt, now), "5m ago");
});
