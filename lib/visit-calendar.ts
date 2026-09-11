export const DEFAULT_VISIT_DURATION_MINUTES = 60;

export type VisitCalendarEventInput = {
  visitId: string;
  scheduledAt: Date | string;
  listingTitle: string;
  locality: string;
  city: string;
  listingUrl: string;
  generatedAt?: Date;
  status?: "ACCEPTED" | "CANCELLED";
  revision?: number;
  updatedAt?: Date | string;
};

export function canAddVisitToCalendar(input: {
  status: string;
  scheduledAt: Date | string | null;
}) {
  if (!["ACCEPTED", "CANCELLED"].includes(input.status) || !input.scheduledAt) return false;
  return Number.isFinite(new Date(input.scheduledAt).getTime());
}

function formatCalendarDate(value: Date) {
  return value
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeCalendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let byteLimit = 75;

  for (const character of line) {
    if (encoder.encode(current + character).length > byteLimit) {
      folded.push(current);
      current = ` ${character}`;
      byteLimit = 75;
    } else {
      current += character;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

export function createVisitCalendarEvent(input: VisitCalendarEventInput) {
  const startsAt = new Date(input.scheduledAt);
  if (!Number.isFinite(startsAt.getTime())) {
    throw new TypeError("A valid visit start time is required.");
  }
  const endsAt = new Date(
    startsAt.getTime() + DEFAULT_VISIT_DURATION_MINUTES * 60_000,
  );
  const generatedAt = input.generatedAt ?? new Date();
  const revision = input.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new TypeError("A valid calendar revision is required.");
  }
  const cancelled = input.status === "CANCELLED";
  const modifiedAt = input.updatedAt ? new Date(input.updatedAt) : generatedAt;
  const approximateLocation = `${input.locality}, ${input.city} (approximate)`;
  const description =
    `${cancelled ? "Cancelled" : "Accepted"} property visit arranged through Roomzi. ` +
    `Approximate location only. Open listing: ${input.listingUrl}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roomzi//Property Visit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:visit-${escapeCalendarText(input.visitId)}@roomzi`,
    `DTSTAMP:${formatCalendarDate(generatedAt)}`,
    `LAST-MODIFIED:${formatCalendarDate(modifiedAt)}`,
    `SEQUENCE:${revision}`,
    "CLASS:PRIVATE",
    `DTSTART:${formatCalendarDate(startsAt)}`,
    `DTEND:${formatCalendarDate(endsAt)}`,
    `SUMMARY:${escapeCalendarText(`Roomzi visit: ${input.listingTitle}`)}`,
    `LOCATION:${escapeCalendarText(approximateLocation)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${escapeCalendarText(input.listingUrl)}`,
    cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}

export function visitCalendarFilename(scheduledAt: Date | string) {
  const date = new Date(scheduledAt);
  const day = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "visit";
  return `roomzi-property-visit-${day}.ics`;
}
