"use client";

import Link from "next/link";
import {
  BedDouble,
  Bell,
  Bookmark,
  Building,
  Building2,
  CircleHelp,
  HouseHeart,
  Menu,
  MessageCircle,
  MessagesSquare,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const navigation = [
  { label: "Find a Room", href: "/rooms", icon: BedDouble },
  { label: "Find a Flatmate", href: "/flatmates", icon: UsersRound },
  { label: "PGs", href: "/pgs", icon: Building },
  { label: "Community", href: "/community", icon: MessagesSquare },
  { label: "Messages", href: "/chat", icon: MessageCircle },
  { label: "Saved", href: "/saved", icon: Bookmark },
  { label: "Profile", href: "/profile", icon: UserRound },
  { label: "How it Works", href: "/#how-it-works", icon: CircleHelp },
];

export function Navbar() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const closeMenu = () => setIsMenuOpen(false);

  const refreshUnreadNotifications = useCallback(async () => {
    const { count, error } = await supabase
      .from("Notification")
      .select("id", { count: "exact", head: true })
      .is("readAt", null);

    if (!error) setUnreadNotifications(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(
      () => void refreshUnreadNotifications(),
      0,
    );

    const channel = supabase
      .channel("navbar-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Notification" },
        () => void refreshUnreadNotifications(),
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialRefresh);
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadNotifications, supabase]);

  const notificationBadge = unreadNotifications ? (
    <span className="flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[0.625rem] font-bold leading-none text-white">
      {unreadNotifications > 99 ? "99+" : unreadNotifications}
    </span>
  ) : null;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
      <div className="content-shell flex h-18 items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          aria-label="NestMate home"
          onClick={closeMenu}
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/15 transition-colors group-hover:bg-primary/90">
            <HouseHeart aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </span>
          <span className="text-[1.3rem] font-semibold tracking-[-0.045em]">
            Nest<span className="text-primary">Mate</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <Link
            href="/notifications"
            aria-label={
              unreadNotifications
                ? `${unreadNotifications} unread notifications`
                : "Notifications"
            }
            className="relative flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            <Bell aria-hidden="true" className="size-4.5" />
            {unreadNotifications ? (
              <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 py-0.5 text-[0.5625rem] font-bold leading-none text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            ) : null}
          </Link>
          <Link
            href="/login"
            className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            Log in
          </Link>
          <Link
            href="/list-property"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/15 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/15 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 active:translate-y-0"
          >
            <Building2 aria-hidden="true" className="size-4" />
            List a Property
          </Link>
        </div>

        <div className="relative xl:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="border border-border/80 bg-card shadow-sm"
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-controls="mobile-navigation"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </Button>
          {unreadNotifications ? (
            <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-background bg-destructive" />
          ) : null}
        </div>
      </div>

      {isMenuOpen ? (
        <div
          id="mobile-navigation"
          className="absolute inset-x-0 top-full border-b border-border/70 bg-background/98 shadow-xl shadow-foreground/8 backdrop-blur-xl xl:hidden"
        >
          <nav
            className="content-shell flex flex-col gap-1.5 py-4"
            aria-label="Mobile navigation"
          >
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-[0.9375rem] font-medium text-foreground transition-colors hover:border-border/80 hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
                onClick={closeMenu}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <item.icon aria-hidden="true" className="size-4.5" />
                </span>
                {item.label}
              </Link>
            ))}

            <Link
              href="/notifications"
              className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-[0.9375rem] font-medium text-foreground transition-colors hover:border-border/80 hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
              onClick={closeMenu}
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Bell aria-hidden="true" className="size-4.5" />
              </span>
              <span className="flex flex-1 items-center justify-between gap-3">
                Notifications
                {notificationBadge}
              </span>
            </Link>

            <div className="my-2 h-px bg-border" />

            <Link
              href="/login"
              className="rounded-xl px-3 py-3 text-[0.9375rem] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
              onClick={closeMenu}
            >
              Log in
            </Link>
            <Link
              href="/list-property"
              className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/15 transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
              onClick={closeMenu}
            >
              <Building2 aria-hidden="true" className="size-4" />
              List a Property
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
