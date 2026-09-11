"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  CalendarPlus,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Navigation,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";

import {
  changeAcceptedVisitAction,
  confirmVisitAttendanceAction,
  markVisitCheckInAction,
  recordListingRealityFeedbackAction,
  recordVisitFeedbackAction,
  recordVisitOutcomeAction,
  requestVisitAction,
  respondVisitAction,
} from "@/app/visits/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatVisitSlot,
  normalizeVisitSlotPreference,
  rankVisitSlotSuggestions,
  timeValueToMinute,
  VISIT_WEEKDAYS,
} from "@/lib/visit-availability";
import { visitEventAt, visitStatusLabel } from "@/lib/visits";
import {
  MAX_VISIT_OUTCOME_NOTE_LENGTH,
  visitOutcomeLabel,
} from "@/lib/visit-outcomes";
import type {
  VisitAttendanceConfirmation,
  VisitOutcomeType,
  VisitRequestView,
  VisitResponseAction,
  VisitSlotSuggestionView,
} from "@/types/visit";

const statusStyles = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PROPOSED: "border-sky-200 bg-sky-50 text-sky-800",
  ACCEPTED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  DECLINED: "border-border bg-muted text-muted-foreground",
  CANCELLED: "border-border bg-muted text-muted-foreground",
} as const;

function formatVisitDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function VisitRequestSection({
  postId,
  postTitle,
  listingAvailability,
  isAuthenticated,
  isOwner,
  visits,
  availableSlots,
}: {
  postId: string;
  postTitle: string;
  listingAvailability: "AVAILABLE" | "RESERVED" | "CLOSED";
  isAuthenticated: boolean;
  isOwner: boolean;
  visits: VisitRequestView[];
  availableSlots: string[];
}) {
  const hasCurrentRequest = visits.some(
    (visit) =>
      visit.role === "REQUESTER" &&
      !visit.isPast &&
      visit.status !== "DECLINED",
  );

  return (
    <section className="surface-card mt-6 p-5 sm:p-6" aria-labelledby="visit-heading">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <CalendarClock aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id="visit-heading" className="text-xl font-semibold">
            Schedule a visit
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Exact dates, times, and notes are visible only to the requester and listing owner.
          </p>
        </div>
      </div>

      {!isOwner && listingAvailability !== "AVAILABLE" ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {listingAvailability === "RESERVED"
            ? "This listing is reserved, so new visit requests are paused. Existing visits remain available to their participants."
            : "This listing is closed and is not accepting visit requests."}
        </p>
      ) : !isAuthenticated ? (
        <div className="mt-5 rounded-2xl border border-border/70 bg-muted/35 p-4">
          <p className="text-sm text-muted-foreground">
            Log in to request a private visit time for {postTitle}.
          </p>
          <Link
            href={`/login?next=/community/post/${encodeURIComponent(postId)}`}
            className={cn(buttonVariants(), "mt-3")}
          >
            Log in to request a visit
          </Link>
        </div>
      ) : !isOwner && !hasCurrentRequest ? (
        <VisitRequestForm postId={postId} availableSlots={availableSlots} />
      ) : !isOwner && hasCurrentRequest ? (
        <p className="mt-5 rounded-xl border border-primary/15 bg-primary/[0.045] px-4 py-3 text-sm font-medium">
          Your current visit request appears below. You can respond if the owner proposes another time.
        </p>
      ) : null}

      {visits.length ? (
        <div className="mt-6 space-y-3">
          {visits.map((visit) => (
            <VisitCard key={visit.id} visit={visit} compact />
          ))}
        </div>
      ) : isOwner ? (
        <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No visit requests for this listing yet.
        </p>
      ) : null}
    </section>
  );
}

function SlotSuggestions({
  suggestions,
  selected,
  onSelect,
  perspective,
}: {
  suggestions: VisitSlotSuggestionView[];
  selected: string;
  onSelect: (startsAt: string) => void;
  perspective: "OWNER" | "REQUESTER";
}) {
  if (!suggestions.length) return null;
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
        <Sparkles aria-hidden="true" className="size-3.5" /> Suggested times
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => {
          const preferenceFit = suggestion.reasons.some((reason) =>
            reason === "PREFERRED_DAY" || reason === "PREFERRED_TIME",
          );
          return (
            <button
              key={suggestion.startsAt}
              type="button"
              onClick={() => onSelect(suggestion.startsAt)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors",
                selected === suggestion.startsAt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary/40",
              )}
            >
              <span className="block text-sm font-semibold">{formatVisitSlot(suggestion.startsAt)}</span>
              <span className={cn("mt-0.5 block text-xs", selected === suggestion.startsAt ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {preferenceFit
                  ? perspective === "REQUESTER" ? "Fits your preferred window" : "Fits the visitor’s shared preference"
                  : "Soonest available option"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Suggestions are deterministic and include only open slots. Private schedules and other bookings are never shown.
      </p>
    </div>
  );
}

function VisitRequestForm({ postId, availableSlots }: { postId: string; availableSlots: string[] }) {
  const router = useRouter();
  const [requestedAt, setRequestedAt] = useState("");
  const [preferredWeekdays, setPreferredWeekdays] = useState<number[]>([]);
  const [preferredStart, setPreferredStart] = useState("");
  const [preferredEnd, setPreferredEnd] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const preferredStartMinute = preferredStart ? timeValueToMinute(preferredStart) : null;
  const preferredEndMinute = preferredEnd ? timeValueToMinute(preferredEnd) : null;
  const preference = normalizeVisitSlotPreference({
    preferredWeekdays,
    preferredStartMinute,
    preferredEndMinute,
  });
  const suggestedSlots = useMemo(
    () => rankVisitSlotSuggestions({ slots: availableSlots, preference }),
    [availableSlots, preference],
  );
  const timePreferenceValid =
    (!preferredStart && !preferredEnd) ||
    (Boolean(preferredStart) && Boolean(preferredEnd) && Boolean(preference));

  const submit = () => {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await requestVisitAction({
        postId,
        requestedAt,
        note,
        preferredWeekdays,
        preferredStartMinute,
        preferredEndMinute,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setRequestedAt("");
      setPreferredWeekdays([]);
      setPreferredStart("");
      setPreferredEnd("");
      setNote("");
      setNotice(result.message);
      router.refresh();
    });
  };

  return (
    <form
      className="mt-5 grid gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {availableSlots.length ? <div className="grid gap-4">
        <fieldset className="rounded-xl border border-border/70 bg-background p-3">
          <legend className="px-1 text-sm font-semibold">Preferred days <span className="font-normal text-muted-foreground">(optional)</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {VISIT_WEEKDAYS.map((day, weekday) => {
              const selected = preferredWeekdays.includes(weekday);
              return <label key={day} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40")}>
                <input type="checkbox" className="sr-only" checked={selected} onChange={() => setPreferredWeekdays((current) => selected ? current.filter((value) => value !== weekday) : [...current, weekday])} />
                {day.slice(0, 3)}
              </label>;
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Preferred from
              <input type="time" value={preferredStart} onChange={(event) => setPreferredStart(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Preferred until
              <input type="time" value={preferredEnd} onChange={(event) => setPreferredEnd(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
          </div>
          {!timePreferenceValid ? <p role="alert" className="mt-2 text-xs font-medium text-destructive">Choose both times with a window of at least one hour.</p> : null}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Used only to rank valid options for this visit. Your raw preference is never shown to the owner.</p>
        </fieldset>
        <SlotSuggestions suggestions={suggestedSlots} onSelect={setRequestedAt} selected={requestedAt} perspective="REQUESTER" />
        <label className="grid gap-1.5 text-sm font-semibold">
        Or choose any available date and time
        <select
          value={requestedAt}
          required
          onChange={(event) => setRequestedAt(event.target.value)}
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
        >
          <option value="">Choose an open slot</option>
          {availableSlots.map((slot) => <option key={slot} value={slot}>{formatVisitSlot(slot)}</option>)}
        </select>
        <span className="font-normal text-muted-foreground">
          India time · one-hour visits. Only currently open times are shown; other bookings stay private.
        </span>
        </label>
      </div> : (
        <p className="rounded-xl border border-dashed border-border bg-background px-4 py-5 text-sm text-muted-foreground">
          The owner has no open visit slots in the next three weeks. Check again later.
        </p>
      )}
      <label className="grid gap-1.5 text-sm font-semibold">
        Note <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Share a convenient time window or anything the owner should know."
          className="resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
        />
      </label>
      {error ? <ActionMessage message={error} error /> : null}
      {notice ? <ActionMessage message={notice} /> : null}
      <Button type="submit" disabled={isPending || !requestedAt || !availableSlots.length || !timePreferenceValid} className="w-full sm:w-fit">
        {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <CalendarClock aria-hidden="true" className="size-4" />}
        {isPending ? "Sending request..." : "Request visit"}
      </Button>
    </form>
  );
}

export function VisitsOverview({ visits }: { visits: VisitRequestView[] }) {
  const upcoming = visits.filter((visit) => !visit.isPast);
  const past = visits.filter((visit) => visit.isPast);

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <CalendarClock aria-hidden="true" className="size-4" />
          Private scheduling
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
          Property visits
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Manage visit requests you sent and received. Exact details remain private to both participants.
        </p>
      </div>

      <VisitGroup title="Upcoming and open" visits={upcoming} empty="No upcoming or open visits." />
      <VisitGroup title="Past and closed" visits={past} empty="No past visit requests yet." />
    </div>
  );
}

function VisitGroup({
  title,
  visits,
  empty,
}: {
  title: string;
  visits: VisitRequestView[];
  empty: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      {visits.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {visits.map((visit) => <VisitCard key={visit.id} visit={visit} />)}
        </div>
      ) : (
        <p className="surface-card mt-4 border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function VisitCard({
  visit,
  compact = false,
}: {
  visit: VisitRequestView;
  compact?: boolean;
}) {
  const router = useRouter();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const eventAt = visitEventAt(visit);

  const respond = (action: VisitResponseAction) => {
    setError("");
    startTransition(async () => {
      const result = await respondVisitAction({
        visitId: visit.id,
        action,
        ...(action === "PROPOSE" ? { proposedAt } : {}),
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setProposalOpen(false);
      router.refresh();
    });
  };

  const ownerCanRespond =
    visit.role === "OWNER" &&
    (visit.status === "PENDING" || visit.status === "PROPOSED") &&
    !visit.isPast;
  const requesterCanRespond =
    visit.role === "REQUESTER" && visit.status === "PROPOSED" && !visit.isPast;

  return (
    <article className={cn("rounded-2xl border border-border/70 bg-card", compact ? "p-4" : "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            {visit.role === "OWNER" ? "Request from" : "Visit with"} {visit.counterpartName}
          </p>
          <Link href={`/community/post/${encodeURIComponent(visit.postId)}`} className="mt-1 block font-semibold hover:text-primary">
            {visit.postTitle}
          </Link>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", statusStyles[visit.status])}>
          {visitStatusLabel(visit.status)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 font-semibold">
          <Clock3 aria-hidden="true" className="size-4 text-primary" />
          {formatVisitDate(eventAt)}
        </p>
        <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-muted-foreground">
          <MapPin aria-hidden="true" className="size-4 text-primary" />
          {visit.locality}
        </p>
      </div>

      {visit.status === "PROPOSED" && visit.proposedAt ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Originally requested: {formatVisitDate(visit.requestedAt)}
        </p>
      ) : null}
      {visit.note ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm text-muted-foreground">
          <MessageSquareText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="break-words">{visit.note}</p>
        </div>
      ) : null}

      {proposalOpen ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
          <SlotSuggestions suggestions={visit.suggestedSlots} onSelect={setProposedAt} selected={proposedAt} perspective={visit.role} />
          <label className="grid gap-1 text-xs font-semibold text-sky-900">
            Propose another date and time
            <select
              value={proposedAt}
              required
              onChange={(event) => setProposedAt(event.target.value)}
              className="h-10 rounded-lg border border-sky-200 bg-white px-3 text-sm text-foreground outline-none focus:ring-3 focus:ring-sky-200"
            >
              <option value="">Choose an open slot</option>
              {visit.availableSlots.map((slot) => <option key={slot} value={slot}>{formatVisitSlot(slot)}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => respond("PROPOSE")} disabled={!proposedAt || isPending}>
              {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
              Send proposal
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setProposalOpen(false)} disabled={isPending}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-3"><ActionMessage message={error} error /></div> : null}

      {["ACCEPTED", "CANCELLED"].includes(visit.status) && visit.scheduledAt ? (
        <div className="mt-4">
          <a
            href={`/visits/${encodeURIComponent(visit.id)}/calendar`}
            download
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            {visit.status === "CANCELLED" ? "Download cancellation" : visit.calendarRevision > 1 ? "Download calendar update" : "Add to calendar"}
          </a>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Uses approximate locality only. Import this file again after any change.
            Calendar apps may require you to replace or remove the old event manually.
          </p>
        </div>
      ) : null}

      {visit.status === "ACCEPTED" && !visit.isPast ? <AcceptedVisitControls visit={visit} /> : null}

      {["ACCEPTED", "CANCELLED"].includes(visit.status) && visit.scheduledAt ? (
        <VisitAttendanceControls visit={visit} />
      ) : null}

      {visit.changes.length ? (
        <details className="mt-4 border-t pt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Change history</summary>
          <ol className="mt-3 space-y-3">
            {visit.changes.map((change) => (
              <li key={change.revision} className="rounded-xl bg-muted/40 p-3">
                <p className="font-medium">
                  {change.actorRole === "OWNER" ? "Listing owner" : "Interested visitor"} · {change.status === "CANCELLED" ? "Cancelled visit" : change.previousStatus === "ACCEPTED" ? "Rescheduled visit" : change.status.toLowerCase()}
                </p>
                {change.previousTime ? <p>Previous time: {formatVisitDate(change.previousTime)}</p> : null}
                {change.scheduledAt && change.status !== "CANCELLED" ? <p>Confirmed time: {formatVisitDate(change.scheduledAt)}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">{formatVisitDate(change.createdAt)}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {ownerCanRespond && !proposalOpen ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => respond("ACCEPT")} disabled={isPending}>
            <Check aria-hidden="true" className="size-4" />Accept
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setProposalOpen(true)} disabled={isPending || !visit.availableSlots.length}>
            <RefreshCw aria-hidden="true" className="size-4" />Propose another time
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => respond("DECLINE")} disabled={isPending}>
            <X aria-hidden="true" className="size-4" />Decline
          </Button>
        </div>
      ) : null}

      {requesterCanRespond && !proposalOpen ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => respond("ACCEPT_PROPOSAL")} disabled={isPending}>
            <Check aria-hidden="true" className="size-4" />Accept proposed time
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => respond("DECLINE_PROPOSAL")} disabled={isPending}>
            <X aria-hidden="true" className="size-4" />Decline
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setProposalOpen(true)} disabled={isPending || !visit.availableSlots.length}>
            <RefreshCw aria-hidden="true" className="size-4" />Choose another time
          </Button>
        </div>
      ) : null}

      {visit.status === "ACCEPTED" &&
      visit.isPast &&
      (visit.myAttendance?.confirmation === "HAPPENED" || visit.myOutcome) ? (
        <VisitOutcomeEditor visit={visit} />
      ) : null}

      {visit.myOutcome?.outcome === "FINALIZED" && visit.moveInChecklistId ? (
        <Link
          href={`/move-in/${encodeURIComponent(visit.moveInChecklistId)}`}
          className={cn(buttonVariants(), "mt-4 w-full sm:w-auto")}
        >
          <ClipboardCheck aria-hidden="true" className="size-4" />
          Open move-in checklist
        </Link>
      ) : null}

      {visit.myFeedback || visit.feedbackEligibility.eligible ? (
        <VisitFeedbackEditor visit={visit} />
      ) : null}

      {visit.role === "REQUESTER" &&
      (visit.myRealityFeedback || visit.realityFeedbackEligibility.eligible) ? (
        <ListingRealityFeedbackEditor visit={visit} />
      ) : null}
    </article>
  );
}

const attendanceOptions: Array<{
  value: VisitAttendanceConfirmation;
  label: string;
}> = [
  { value: "HAPPENED", label: "It happened" },
  { value: "MISSED", label: "It was missed" },
  { value: "CANCELLED", label: "It was cancelled" },
];

function VisitAttendanceControls({ visit }: { visit: VisitRequestView }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (
    operation: "CHECK_IN" | VisitAttendanceConfirmation,
  ) => {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = operation === "CHECK_IN"
        ? await markVisitCheckInAction({ visitId: visit.id })
        : await confirmVisitAttendanceAction({
            visitId: visit.id,
            confirmation: operation,
          });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  };

  return (
    <section className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/55 p-4">
      <div className="flex items-start gap-2.5">
        <Navigation aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
        <div>
          <h3 className="text-sm font-semibold text-emerald-950">Visit attendance</h3>
          <p className="mt-1 text-xs leading-5 text-emerald-900/75">
            No GPS is collected. Your check-in is private, and the other participant’s
            final status appears only after both of you confirm.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Arrival
          </p>
          {visit.myAttendance?.checkedInAt ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 aria-hidden="true" className="size-4" /> You marked “I’m here”
            </p>
          ) : visit.myAttendance?.confirmation ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Arrival check-in closed after your final confirmation.
            </p>
          ) : visit.checkInEligibility.eligible ? (
            <Button
              type="button"
              size="sm"
              className="mt-2 w-full sm:w-fit"
              disabled={pending}
              onClick={() => run("CHECK_IN")}
            >
              {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Navigation aria-hidden="true" className="size-4" />}
              I’m here
            </Button>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {visit.checkInEligibility.reason}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            After the visit
          </p>
          {visit.myAttendance?.confirmation ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {visit.myAttendance.confirmation === "HAPPENED"
                ? "You confirmed it happened"
                : visit.myAttendance.confirmation === "MISSED"
                  ? "You confirmed it was missed"
                  : "You confirmed it was cancelled"}
            </p>
          ) : visit.attendanceEligibility.eligible ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {attendanceOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={option.value === "HAPPENED" ? "default" : "outline"}
                  disabled={pending}
                  onClick={() => run(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {visit.attendanceEligibility.reason}
            </p>
          )}
        </div>
      </div>

      {visit.sharedAttendance ? (
        <p className="mt-3 rounded-xl bg-emerald-100/80 px-3 py-2 text-xs font-medium text-emerald-900">
          Both participants have confirmed. The other participant marked: {visit.sharedAttendance.counterpartConfirmation === "HAPPENED"
            ? "visit happened"
            : visit.sharedAttendance.counterpartConfirmation === "MISSED"
              ? "visit was missed"
              : "visit was cancelled"}.
        </p>
      ) : visit.myAttendance?.confirmation ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Your confirmation is saved. The other participant’s status remains private until they confirm too.
        </p>
      ) : null}
      {error ? <div className="mt-3"><ActionMessage message={error} error /></div> : null}
      {message ? <div className="mt-3"><ActionMessage message={message} /></div> : null}
    </section>
  );
}

function AcceptedVisitControls({ visit }: { visit: VisitRequestView }) {
  const router = useRouter();
  const [action, setAction] = useState<"RESCHEDULE" | "CANCEL" | null>(null);
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const confirm = () => {
    if (!action) return;
    startTransition(async () => {
      try {
        const result = await changeAcceptedVisitAction({
          visitId: visit.id, action, revision: visit.calendarRevision,
          scheduledAt: action === "RESCHEDULE" ? time : undefined,
        });
        setMessage(result.message);
        if (result.success) { setAction(null); router.refresh(); }
      } catch {
        setMessage("We could not save the change. Please try again.");
      }
    });
  };
  return (
    <div className="mt-4">
      {action ? (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-sm font-semibold">{action === "CANCEL" ? "Cancel this confirmed visit?" : "Change the confirmed visit time?"}</p>
          <p className="text-xs text-muted-foreground">Both participants will be notified. Please agree the new time together before rescheduling.</p>
          {action === "RESCHEDULE" ? (
            <div className="grid gap-3">
              <SlotSuggestions suggestions={visit.suggestedSlots} onSelect={setTime} selected={time} perspective={visit.role} />
              <label className="grid gap-1 text-sm">
              New date and time
              <select value={time} disabled={pending}
                onChange={(event) => setTime(event.target.value)}
                className="h-11 min-w-0 rounded-lg border bg-background px-3">
                <option value="">Choose an open slot</option>
                {visit.availableSlots.map((slot) => <option key={slot} value={slot}>{formatVisitSlot(slot)}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">
                Confirmed visits use a one-hour slot.
              </span>
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || (action === "RESCHEDULE" && !time)} onClick={confirm}>
              {pending ? "Saving…" : action === "CANCEL" ? "Confirm cancellation" : "Confirm new time"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAction(null)}>Keep current visit</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!visit.availableSlots.length} onClick={() => setAction("RESCHEDULE")}>Reschedule</Button>
          <Button size="sm" variant="ghost" onClick={() => setAction("CANCEL")}>Cancel visit</Button>
        </div>
      )}
      {message ? <p role="status" className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}

const outcomeOptions: Array<{ value: VisitOutcomeType; label: string }> = [
  { value: "INTERESTED", label: "Interested" },
  { value: "NOT_SUITABLE", label: "Not suitable" },
  { value: "FINALIZED", label: "Finalized" },
  { value: "NO_SHOW", label: "No show" },
];

function VisitOutcomeEditor({ visit }: { visit: VisitRequestView }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<VisitOutcomeType | "">(
    visit.myOutcome?.outcome ?? "",
  );
  const [privateNote, setPrivateNote] = useState(
    visit.myOutcome?.privateNote ?? "",
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const saveOutcome = () => {
    if (!outcome) return;
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await recordVisitOutcomeAction({
        visitId: visit.id,
        outcome,
        privateNote,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      router.refresh();
    });
  };

  return (
    <form
      className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        saveOutcome();
      }}
    >
      <div className="flex items-start gap-2.5">
        <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">
            {visit.myOutcome ? "Your visit outcome" : "How did the visit go?"}
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Your selection and note are visible only to you. Roomzi uses a coarse signal to improve your recommendations.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <label className="grid gap-1.5 text-xs font-semibold">
          Outcome
          <select
            required
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as VisitOutcomeType)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
          >
            <option value="">Choose an outcome</option>
            {outcomeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold">
          Private note <span className="font-normal text-muted-foreground">(optional)</span>
          <textarea
            value={privateNote}
            maxLength={MAX_VISIT_OUTCOME_NOTE_LENGTH}
            rows={2}
            onChange={(event) => setPrivateNote(event.target.value)}
            placeholder="Add a reminder for yourself. This is never shown publicly."
            className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-primary focus:ring-3 focus:ring-ring/15"
          />
        </label>
      </div>

      {visit.myOutcome ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Currently saved as <span className="font-semibold text-foreground">{visitOutcomeLabel(visit.myOutcome.outcome)}</span>.
        </p>
      ) : null}
      {error ? <div className="mt-3"><ActionMessage message={error} error /></div> : null}
      {notice ? <div className="mt-3"><ActionMessage message={notice} /></div> : null}
      <Button type="submit" size="sm" className="mt-3 w-full sm:w-fit" disabled={!outcome || isPending}>
        {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ClipboardCheck aria-hidden="true" className="size-4" />}
        {isPending ? "Saving outcome..." : visit.myOutcome ? "Update outcome" : "Save outcome"}
      </Button>
    </form>
  );
}

const feedbackRatingFields = [
  { key: "propertyAccuracy", label: "Property accuracy", hint: "Matched the listing and visit expectations" },
  { key: "cleanliness", label: "Cleanliness", hint: "Condition of the property and shared spaces" },
  { key: "communicationQuality", label: "Communication", hint: "Clarity, responsiveness, and coordination" },
  { key: "safetyComfort", label: "Safety & comfort", hint: "How safe and comfortable the visit felt" },
  { key: "overallExperience", label: "Overall experience", hint: "Your overall impression of the visit" },
] as const;

function VisitFeedbackEditor({ visit }: { visit: VisitRequestView }) {
  const router = useRouter();
  const [ratings, setRatings] = useState({
    propertyAccuracy: visit.myFeedback?.propertyAccuracy ?? 0,
    cleanliness: visit.myFeedback?.cleanliness ?? 0,
    communicationQuality: visit.myFeedback?.communicationQuality ?? 0,
    safetyComfort: visit.myFeedback?.safetyComfort ?? 0,
    overallExperience: visit.myFeedback?.overallExperience ?? 0,
  });
  const [privateNote, setPrivateNote] = useState(
    visit.myFeedback?.privateNote ?? "",
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const complete = Object.values(ratings).every(
    (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5,
  );

  const saveFeedback = () => {
    if (!complete) return;
    setNotice("");
    setError("");
    startTransition(async () => {
      const result = await recordVisitFeedbackAction({
        visitId: visit.id,
        ...ratings,
        privateNote,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      router.refresh();
    });
  };

  return (
    <form
      className="mt-4 rounded-2xl border border-violet-200/80 bg-violet-50/45 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        saveFeedback();
      }}
    >
      <div className="flex items-start gap-2.5">
        <Star aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-violet-700" />
        <div>
          <h3 className="text-sm font-semibold text-violet-950">
            {visit.myFeedback ? "Your private visit feedback" : "Share private visit feedback"}
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-violet-900/75">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Raw ratings and notes are visible only to you. Future listing signals use
            anonymous averages only after at least three responses; notes and identities
            are never included.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {feedbackRatingFields.map((field) => (
          <label
            key={field.key}
            className="grid gap-1.5 rounded-xl border border-violet-200/70 bg-background p-3 text-xs font-semibold"
          >
            {field.label}
            <span className="font-normal leading-4 text-muted-foreground">
              {field.hint}
            </span>
            <select
              required
              value={ratings[field.key] || ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                setRatings((current) => ({ ...current, [field.key]: value }));
              }}
              className="mt-1 h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-violet-500 focus:ring-3 focus:ring-violet-200"
            >
              <option value="">Choose 1–5</option>
              <option value="1">1 · Poor</option>
              <option value="2">2 · Fair</option>
              <option value="3">3 · Good</option>
              <option value="4">4 · Very good</option>
              <option value="5">5 · Excellent</option>
            </select>
          </label>
        ))}
      </div>

      <label className="mt-3 grid gap-1.5 text-xs font-semibold">
        Private note <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea
          value={privateNote}
          maxLength={1000}
          rows={3}
          onChange={(event) => setPrivateNote(event.target.value)}
          placeholder="Keep a private reminder about the property or visit."
          className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-violet-500 focus:ring-3 focus:ring-violet-200"
        />
      </label>

      {error ? <div className="mt-3"><ActionMessage message={error} error /></div> : null}
      {notice ? <div className="mt-3"><ActionMessage message={notice} /></div> : null}
      <Button
        type="submit"
        size="sm"
        className="mt-3 w-full sm:w-fit"
        disabled={!complete || isPending}
      >
        {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Star aria-hidden="true" className="size-4" />}
        {isPending ? "Saving feedback..." : visit.myFeedback ? "Update private feedback" : "Save private feedback"}
      </Button>
    </form>
  );
}

const listingRealityRatingFields = [
  { key: "photosAccuracy", label: "Photos", hint: "How closely the photos matched what you visited" },
  { key: "costAccuracy", label: "Rent & deposit", hint: "Whether the stated costs matched what was discussed" },
  { key: "amenitiesAccuracy", label: "Amenities", hint: "Whether listed amenities were present and usable" },
  { key: "conditionAccuracy", label: "Cleanliness & condition", hint: "How accurately the listing represented the condition" },
  { key: "locationAccuracy", label: "Location", hint: "Whether the approximate locality and position were accurate" },
  { key: "descriptionAccuracy", label: "Listing description", hint: "How well the written details matched reality" },
] as const;

function ListingRealityFeedbackEditor({ visit }: { visit: VisitRequestView }) {
  const router = useRouter();
  const [ratings, setRatings] = useState({
    photosAccuracy: visit.myRealityFeedback?.photosAccuracy ?? 0,
    costAccuracy: visit.myRealityFeedback?.costAccuracy ?? 0,
    amenitiesAccuracy: visit.myRealityFeedback?.amenitiesAccuracy ?? 0,
    conditionAccuracy: visit.myRealityFeedback?.conditionAccuracy ?? 0,
    locationAccuracy: visit.myRealityFeedback?.locationAccuracy ?? 0,
    descriptionAccuracy: visit.myRealityFeedback?.descriptionAccuracy ?? 0,
  });
  const [privateNote, setPrivateNote] = useState(
    visit.myRealityFeedback?.privateNote ?? "",
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const complete = Object.values(ratings).every(
    (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5,
  );

  return (
    <form
      className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!complete) return;
        setNotice("");
        setError("");
        startTransition(async () => {
          const result = await recordListingRealityFeedbackAction({
            visitId: visit.id,
            ...ratings,
            privateNote,
          });
          if (!result.success) {
            setError(result.message);
            return;
          }
          setNotice(result.message);
          router.refresh();
        });
      }}
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
        <div>
          <h3 className="text-sm font-semibold text-emerald-950">
            {visit.myRealityFeedback ? "Your Listing Reality rating" : "Rate how the listing matched reality"}
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-emerald-900/75">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Your identity, individual ratings, and note stay private. A public score
            appears only after at least three verified visitor responses; raw reviews
            are never published.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {listingRealityRatingFields.map((field) => (
          <label
            key={field.key}
            className="grid gap-1.5 rounded-xl border border-emerald-200/70 bg-background p-3 text-xs font-semibold"
          >
            {field.label}
            <span className="font-normal leading-4 text-muted-foreground">{field.hint}</span>
            <select
              required
              value={ratings[field.key] || ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                setRatings((current) => ({ ...current, [field.key]: value }));
              }}
              className="mt-1 h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-emerald-500 focus:ring-3 focus:ring-emerald-200"
            >
              <option value="">Choose 1–5</option>
              <option value="1">1 · Very different</option>
              <option value="2">2 · Mostly different</option>
              <option value="3">3 · Partly matched</option>
              <option value="4">4 · Mostly matched</option>
              <option value="5">5 · Matched closely</option>
            </select>
          </label>
        ))}
      </div>

      <label className="mt-3 grid gap-1.5 text-xs font-semibold">
        Private note <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea
          value={privateNote}
          maxLength={1000}
          rows={3}
          onChange={(event) => setPrivateNote(event.target.value)}
          placeholder="Add a private reminder. This note is never shared or aggregated."
          className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-emerald-500 focus:ring-3 focus:ring-emerald-200"
        />
      </label>

      {error ? <div className="mt-3"><ActionMessage message={error} error /></div> : null}
      {notice ? <div className="mt-3"><ActionMessage message={notice} /></div> : null}
      <Button type="submit" size="sm" className="mt-3 w-full sm:w-fit" disabled={!complete || isPending}>
        {isPending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ShieldCheck aria-hidden="true" className="size-4" />}
        {isPending ? "Saving rating..." : visit.myRealityFeedback ? "Update verified rating" : "Save verified rating"}
      </Button>
    </form>
  );
}

function ActionMessage({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <p role={error ? "alert" : "status"} className={cn("flex items-start gap-2 text-sm font-medium", error ? "text-destructive" : "text-emerald-700")}>
      {error ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
      {message}
    </p>
  );
}
