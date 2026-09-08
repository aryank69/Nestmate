"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CalendarClock,
  Check,
  CircleAlert,
  GitCompareArrows,
  Heart,
  IndianRupee,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
  UserMinus,
  UsersRound,
} from "lucide-react";

import {
  addTeamListingCommentAction,
  inviteSearchTeamMemberAction,
  leaveSearchTeamAction,
  removeSearchTeamMemberAction,
  shareSavedListingWithTeamAction,
  shareVisitWithTeamAction,
  updateTeamListingStatusAction,
  voteOnTeamListingAction,
} from "@/app/teams/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  SearchTeamActionState,
  SearchTeamListingView,
  SearchTeamVoteChoice,
  SearchTeamWorkspaceData,
} from "@/types/search-team";

export function SearchTeamWorkspace({ data }: { data: SearchTeamWorkspaceData }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [postId, setPostId] = useState("");
  const [visitId, setVisitId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (operation: () => Promise<SearchTeamActionState>, onSuccess?: () => void) => {
    setNotice(""); setError("");
    startTransition(async () => {
      const result = await operation();
      if (!result.success) return setError(result.message);
      setNotice(result.message); onSuccess?.(); router.refresh();
    });
  };
  const toggleCompare = (id: string) => {
    if (selected.includes(id)) return setSelected(selected.filter((value) => value !== id));
    if (selected.length >= 4) return setError("You can compare up to four shared listings.");
    setError(""); setSelected([...selected, id]);
  };
  const compareHref = `/teams/${data.id}/compare?ids=${encodeURIComponent(selected.join(","))}`;

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/teams" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← All search teams</Link>
      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><UsersRound className="size-4" /> Team Mode · {data.role === "OWNER" ? "Owner" : "Member"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{data.name}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">A private workspace for listings, votes, comments, comparisons, and privacy-safe visit summaries.</p>
        </div>
        {data.role === "MEMBER" ? <Button variant="outline" onClick={() => { if (window.confirm("Leave this private search team?")) run(() => leaveSearchTeamAction({ teamId: data.id }), () => router.push("/teams")); }} disabled={pending}>Leave team</Button> : null}
      </header>

      {data.error || error ? <p role="alert" className="mt-5 flex gap-2 rounded-xl border border-destructive/20 bg-destructive/8 p-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" />{error || data.error}</p> : null}
      {notice ? <p role="status" className="mt-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="size-4 shrink-0" />{notice}</p> : null}

      <div className="mt-7 grid gap-5 lg:grid-cols-[19rem_1fr]">
        <aside className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="font-semibold">Members</h2>
            <ul className="mt-3 space-y-2">{data.members.map((member) => <li key={member.id} className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{member.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{member.name}</span><span className="text-[0.6875rem] text-muted-foreground">{member.role === "OWNER" ? "Owner" : "Member"}</span>{data.role === "OWNER" && member.role === "MEMBER" ? <button aria-label={`Remove ${member.name}`} onClick={() => { if (window.confirm(`Remove ${member.name} from this team?`)) run(() => removeSearchTeamMemberAction({ teamId: data.id, userId: member.id })); }} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><UserMinus className="size-3.5" /></button> : null}</li>)}</ul>
            <form className="mt-4 border-t border-border/70 pt-4" onSubmit={(event) => { event.preventDefault(); run(() => inviteSearchTeamMemberAction({ teamId: data.id, email }), () => setEmail("")); }}>
              <label className="grid gap-1.5 text-xs font-semibold">Invite by account email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="friend@example.com" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /></label>
              <Button size="sm" className="mt-2 w-full" disabled={pending || !email.trim()}><Send className="size-3.5" />Invite member</Button>
            </form>
            {data.invites.length ? <div className="mt-3 space-y-1.5">{data.invites.map((invite) => <p key={invite.id} className="text-xs text-muted-foreground">Pending: {invite.recipientName} · until {invite.expiresAt}</p>)}</div> : null}
          </section>

          <section className="surface-card p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Share2 className="size-4 text-primary" />Share a saved listing</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Only eligible Room and PG listings from your own saved items appear here.</p>
            <select value={postId} onChange={(event) => setPostId(event.target.value)} className="mt-3 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">Choose a listing</option>{data.shareOptions.map((option) => <option key={option.id} value={option.id}>{option.title} · {option.locality}</option>)}</select>
            <Button size="sm" className="mt-2 w-full" disabled={!postId || pending} onClick={() => run(() => shareSavedListingWithTeamAction({ teamId: data.id, postId }), () => setPostId(""))}>Share listing</Button>
          </section>

          <section className="surface-card p-5">
            <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-primary" />Coordinate visits</h2>
            <p className="mt-1 flex gap-1.5 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Share only listing, status, and time. Notes and counterpart details stay private.</p>
            <select value={visitId} onChange={(event) => setVisitId(event.target.value)} className="mt-3 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">Choose your visit</option>{data.visitOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            <Button size="sm" variant="outline" className="mt-2 w-full" disabled={!visitId || pending} onClick={() => run(() => shareVisitWithTeamAction({ teamId: data.id, visitId }), () => setVisitId(""))}>Share visit summary</Button>
            <Link href="/visits" className="mt-2 block text-center text-xs font-semibold text-primary hover:underline">Manage private visits</Link>
          </section>
        </aside>

        <section>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-semibold">Shared options</h2><p className="mt-1 text-xs text-muted-foreground">Select 2–4 visible listings to compare as a team.</p></div>
            {selected.length >= 2 ? <Link href={compareHref} className={buttonVariants({ size: "sm" })}><GitCompareArrows className="size-4" />Compare {selected.length}</Link> : <Button size="sm" disabled><GitCompareArrows className="size-4" />Compare</Button>}
          </div>
          {data.listings.length ? <div className="mt-4 space-y-4">{data.listings.map((listing) => <TeamListingCard key={listing.id} teamId={data.id} listing={listing} selected={selected.includes(listing.id)} compareDisabled={!selected.includes(listing.id) && selected.length >= 4} pending={pending} onToggleCompare={() => toggleCompare(listing.id)} run={run} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center"><Heart className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 font-semibold">No shared listings yet</p><p className="mt-1 text-sm text-muted-foreground">Save an eligible listing, then share it from this workspace.</p></div>}
        </section>
      </div>
    </div>
  );
}

function TeamListingCard({ teamId, listing, selected, compareDisabled, pending, onToggleCompare, run }: { teamId: string; listing: SearchTeamListingView; selected: boolean; compareDisabled: boolean; pending: boolean; onToggleCompare: () => void; run: (operation: () => Promise<SearchTeamActionState>, onSuccess?: () => void) => void }) {
  const [comment, setComment] = useState("");
  const voteOptions: Array<{ value: SearchTeamVoteChoice; label: string; icon: typeof ThumbsUp }> = [
    { value: "YES", label: "Yes", icon: ThumbsUp },
    { value: "MAYBE", label: "Maybe", icon: Heart },
    { value: "NO", label: "No", icon: ThumbsDown },
  ];
  return <article className={cn("surface-card p-5 sm:p-6", selected && "ring-2 ring-primary/25")}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">{listing.category}</p><h3 className="mt-1 text-xl font-semibold">{listing.title}</h3><p className="mt-1 text-xs text-muted-foreground">Shared by {listing.addedByName}</p></div>
      <button type="button" aria-pressed={selected} disabled={compareDisabled} onClick={onToggleCompare} className={cn("inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40", selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border hover:border-primary/30")}><GitCompareArrows className="size-4" />{selected ? "Selected" : "Compare"}</button>
    </div>
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><p className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><MapPin className="size-3.5 text-primary" />{listing.locality}, {listing.city}</p><p className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><IndianRupee className="size-3.5 text-primary" />{listing.priceLabel}</p><p className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5"><CalendarClock className="size-3.5 text-primary" />{listing.moveInLabel}</p></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><Button size="sm" variant={listing.status === "SHORTLISTED" ? "default" : "outline"} disabled={pending} onClick={() => run(() => updateTeamListingStatusAction({ teamId, postId: listing.id, status: listing.status === "SHORTLISTED" ? "CONSIDERING" : "SHORTLISTED" }))}><Heart className={cn("size-4", listing.status === "SHORTLISTED" && "fill-current")} />{listing.status === "SHORTLISTED" ? "Team shortlisted" : "Shortlist"}</Button>{voteOptions.map((option) => <Button key={option.value} size="sm" variant={listing.myVote === option.value ? "secondary" : "ghost"} disabled={pending} onClick={() => run(() => voteOnTeamListingAction({ teamId, postId: listing.id, choice: option.value }))}><option.icon className="size-3.5" />{option.label} {listing.votes[option.value]}</Button>)}<Link href={listing.detailHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>View listing</Link></div>
    {listing.visits.length ? <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-sky-900"><CalendarClock className="size-3.5" />Shared visit coordination</p>{listing.visits.map((visit) => <p key={visit.id} className="mt-1.5 text-xs text-sky-900/75">{visit.sharedByName} · {visit.status.toLowerCase()}{visit.scheduledAt ? ` · ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(visit.scheduledAt))}` : ""}</p>)}</div> : null}
    <div className="mt-4 border-t border-border/70 pt-4"><h4 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="size-4 text-primary" />Team comments</h4>{listing.comments.length ? <ul className="mt-3 space-y-2">{listing.comments.map((item) => <li key={item.id} className="rounded-xl bg-muted/45 px-3 py-2.5"><p className="text-xs font-semibold">{item.authorName} <span className="font-normal text-muted-foreground">· {item.createdAt}</span></p><p className="mt-1 text-sm leading-5">{item.body}</p></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No team comments yet.</p>}<form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); run(() => addTeamListingCommentAction({ teamId, postId: listing.id, body: comment }), () => setComment("")); }}><input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="Add a private team comment" className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /><Button type="submit" size="sm" disabled={pending || !comment.trim()}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}Send</Button></form></div>
  </article>;
}
