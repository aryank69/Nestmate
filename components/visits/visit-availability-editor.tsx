"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, CalendarRange, LoaderCircle, Trash2 } from "lucide-react";

import {
  addVisitAvailabilityBlockAction,
  removeVisitAvailabilityBlockAction,
  saveVisitAvailabilityAction,
} from "@/app/visits/actions";
import { Button } from "@/components/ui/button";
import {
  minuteToTimeValue,
  timeValueToMinute,
  VISIT_WEEKDAYS,
} from "@/lib/visit-availability";
import type { VisitAvailabilityView } from "@/types/visit";

function toIsoDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function formatBlock(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

type EditableRule = { enabled: boolean; start: string; end: string };

export function VisitAvailabilityEditor({ availability }: { availability: VisitAvailabilityView }) {
  const router = useRouter();
  const [rules, setRules] = useState<EditableRule[]>(() =>
    VISIT_WEEKDAYS.map((_, weekday) => {
      const rule = availability.rules.find((item) => item.weekday === weekday);
      return {
        enabled: Boolean(rule),
        start: minuteToTimeValue(rule?.startMinute ?? 600),
        end: minuteToTimeValue(rule?.endMinute ?? 1080),
      };
    }),
  );
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!availability.canManage) return null;

  const save = () => {
    const selected = rules.flatMap((rule, weekday) => {
      const startMinute = timeValueToMinute(rule.start);
      const endMinute = timeValueToMinute(rule.end);
      return rule.enabled && startMinute !== null && endMinute !== null
        ? [{ weekday, startMinute, endMinute }]
        : [];
    });
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await saveVisitAvailabilityAction({ rules: selected });
      if (!result.success) setError(result.message);
      else { setNotice(result.message); router.refresh(); }
    });
  };

  const addBlock = () => {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await addVisitAvailabilityBlockAction({
        startsAt: toIsoDate(blockStart),
        endsAt: toIsoDate(blockEnd),
      });
      if (!result.success) setError(result.message);
      else {
        setBlockStart("");
        setBlockEnd("");
        setNotice(result.message);
        router.refresh();
      }
    });
  };

  const removeBlock = (blockId: string) => {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await removeVisitAvailabilityBlockAction({ blockId });
      if (!result.success) setError(result.message);
      else { setNotice(result.message); router.refresh(); }
    });
  };

  return (
    <section className="surface-card mt-8 p-5 sm:p-6" aria-labelledby="availability-heading">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <CalendarRange aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id="availability-heading" className="text-xl font-semibold">Your visit availability</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Shared by your Room Available and PG Available listings. Visitors see only open one-hour slots, never your schedule or other bookings.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {VISIT_WEEKDAYS.map((day, weekday) => (
          <div key={day} className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-[8rem_1fr_1fr] sm:items-center">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={rules[weekday].enabled}
                disabled={pending}
                onChange={(event) => setRules((current) => current.map((rule, index) => index === weekday ? { ...rule, enabled: event.target.checked } : rule))}
                className="size-4 accent-primary"
              />
              {day}
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              From
              <input type="time" value={rules[weekday].start} disabled={pending || !rules[weekday].enabled}
                onChange={(event) => setRules((current) => current.map((rule, index) => index === weekday ? { ...rule, start: event.target.value } : rule))}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Until
              <input type="time" value={rules[weekday].end} disabled={pending || !rules[weekday].enabled}
                onChange={(event) => setRules((current) => current.map((rule, index) => index === weekday ? { ...rule, end: event.target.value } : rule))}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Times use India Standard Time. Open slots are generated every 30 minutes and last one hour.</p>
      <Button className="mt-4" type="button" disabled={pending} onClick={save}>
        {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <CalendarRange aria-hidden="true" className="size-4" />}
        Save weekly availability
      </Button>

      <div className="mt-7 border-t pt-6">
        <div className="flex items-center gap-2">
          <Ban aria-hidden="true" className="size-4 text-primary" />
          <h3 className="font-semibold">Blocked dates and times</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Add exceptions for days or hours when you are unavailable.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">Starts
            <input type="datetime-local" value={blockStart} disabled={pending} onChange={(event) => setBlockStart(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">Ends
            <input type="datetime-local" value={blockEnd} disabled={pending} onChange={(event) => setBlockEnd(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3" />
          </label>
        </div>
        <Button className="mt-3" type="button" variant="outline" disabled={pending || !blockStart || !blockEnd} onClick={addBlock}>Add blocked time</Button>

        {availability.blocks.length ? (
          <ul className="mt-4 grid gap-2">
            {availability.blocks.map((block) => (
              <li key={block.id} className="flex flex-col gap-2 rounded-xl bg-muted/45 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>{formatBlock(block.startsAt)} – {formatBlock(block.endsAt)}</span>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => removeBlock(block.id)}>
                  <Trash2 aria-hidden="true" className="size-4" /> Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No upcoming blocked times.</p>}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-sm">{notice}</p> : null}
    </section>
  );
}
