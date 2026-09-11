"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Check, CircleAlert, LoaderCircle, LockKeyhole, Plus, UsersRound, X } from "lucide-react";

import { createSearchTeamAction, respondSearchTeamInviteAction } from "@/app/teams/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { SearchTeamHubData } from "@/types/search-team";

export function SearchTeamsPage({ data }: { data: SearchTeamHubData }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const createTeam = () => {
    setMessage(""); setError("");
    startTransition(async () => {
      const result = await createSearchTeamAction({ name });
      if (!result.success) return setError(result.message);
      setName(""); setMessage(result.message);
      if (result.teamId) router.push(`/teams/${result.teamId}`);
      else router.refresh();
    });
  };

  const respond = (inviteId: string, response: "ACCEPT" | "DECLINE") => {
    setMessage(""); setError("");
    startTransition(async () => {
      const result = await respondSearchTeamInviteAction({ inviteId, response });
      if (!result.success) return setError(result.message);
      setMessage(result.message);
      if (response === "ACCEPT" && result.teamId) router.push(`/teams/${result.teamId}`);
      else router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary"><UsersRound className="size-4" /> Private collaboration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">Search together in Team Mode</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">Share only the listings and visit summaries you choose. Personal profile, commute, chat, and visit notes stay private.</p>
      </header>

      {data.error || error ? <p role="alert" className="mt-6 flex gap-2 rounded-xl border border-destructive/20 bg-destructive/8 p-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" />{error || data.error}</p> : null}
      {message ? <p role="status" className="mt-6 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="size-4 shrink-0" />{message}</p> : null}

      {data.invites.length ? (
        <section className="mt-7 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
          <h2 className="text-lg font-semibold">Team invitations</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {data.invites.map((invite) => (
              <article key={invite.id} className="rounded-xl border border-border/70 bg-background p-4">
                <p className="font-semibold">{invite.teamName}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invited by {invite.invitedByName} · expires {invite.expiresAt}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => respond(invite.id, "ACCEPT")} disabled={pending}><Check className="size-4" />Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => respond(invite.id, "DECLINE")} disabled={pending}><X className="size-4" />Decline</Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[21rem_1fr]">
        <form className="surface-card p-5" onSubmit={(event) => { event.preventDefault(); createTeam(); }}>
          <h2 className="text-lg font-semibold">Create a private team</h2>
          <p className="mt-1 flex gap-1.5 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Only accepted members can open the workspace.</p>
          <label className="mt-4 grid gap-1.5 text-xs font-semibold">Team name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Our Bengaluru home search" className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/15" />
          </label>
          <Button type="submit" className="mt-4 w-full" disabled={pending || name.trim().length < 2}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Create team</Button>
        </form>

        <section>
          <h2 className="text-xl font-semibold">Your search teams</h2>
          {data.teams.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2">{data.teams.map((team) => (
            <article key={team.id} className="surface-card p-5">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{team.role === "OWNER" ? "Owner" : "Member"}</span>
              <h3 className="mt-3 text-lg font-semibold">{team.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{team.memberCount} members · {team.listingCount} shared listings</p>
              <p className="mt-1 text-xs text-muted-foreground">Updated {team.updatedAt}</p>
              <Link href={`/teams/${team.id}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`}>Open workspace <ArrowRight className="size-4" /></Link>
            </article>
          ))}</div> : <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center"><UsersRound className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 font-semibold">No teams yet</p><p className="mt-1 text-sm text-muted-foreground">Create one or accept an invitation to start searching together.</p></div>}
        </section>
      </div>
    </div>
  );
}
