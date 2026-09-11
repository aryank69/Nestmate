"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HouseHeart,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { loginAction, signupAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  getFriendlyAuthError,
  logAuthError,
} from "@/lib/supabase/auth-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { initialAuthFormState } from "@/types/auth";

type AuthFormProps = {
  mode: "login" | "signup";
  nextPath: string;
  notice?: string;
  error?: string;
  googleEnabled: boolean;
};

const inputClassName =
  "h-12 w-full rounded-xl border border-input bg-background pl-11 pr-4 text-[0.9375rem] font-medium text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground/70 hover:border-border focus:border-primary focus:ring-3 focus:ring-ring/15";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.11-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.64.39 3.2 1.04 4.55l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  );
}

export function AuthForm({
  mode,
  nextPath,
  notice,
  error,
  googleEnabled,
}: AuthFormProps) {
  const isLogin = mode === "login";
  const action = isLogin ? loginAction : signupAction;
  const [state, formAction, isPending] = useActionState(
    action,
    initialAuthFormState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [isGooglePending, setIsGooglePending] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleError("");

    if (!googleEnabled) {
      setGoogleError(
        "Google sign-in is not enabled for this Supabase project. Please use email for now.",
      );
      return;
    }

    setIsGooglePending(true);

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);

    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });

    if (oauthError) {
      logAuthError("oauth", oauthError);
      setGoogleError(getFriendlyAuthError(oauthError, "oauth"));
      setIsGooglePending(false);
    }
  };

  const visibleMessage = googleError || state.message || error || notice;
  const messageStatus =
    googleError || state.status === "error" || error ? "error" : "success";

  return (
    <main className="relative min-h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--color-secondary),transparent_34%),radial-gradient(circle_at_bottom_right,var(--color-accent),transparent_30%)] opacity-45" />

      <div className="content-shell relative grid min-h-svh items-center gap-8 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-10">
        <section className="hidden lg:block">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <HouseHeart aria-hidden="true" className="size-5.5" />
            </span>
            <span className="text-2xl font-semibold tracking-[-0.05em]">
              Room<span className="text-primary">zi</span>
            </span>
          </Link>

          <p className="mt-14 text-sm font-semibold text-primary">
            Find your place. Find your people.
          </p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.06] tracking-[-0.055em] xl:text-6xl">
            A better way to find a home that feels right.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
            Join local housing communities, meet potential flatmates, and keep
            your search in one welcoming place.
          </p>

          <div className="mt-9 grid max-w-lg gap-3 sm:grid-cols-2">
            {[
              { icon: MapPin, text: "Local, relevant listings" },
              { icon: UsersRound, text: "People-first profiles" },
              { icon: ShieldCheck, text: "Secure account access" },
              { icon: Sparkles, text: "Simple, calm experience" },
            ].map((benefit) => (
              <div
                key={benefit.text}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/75 px-4 py-3.5 shadow-sm shadow-foreground/5 backdrop-blur"
              >
                <benefit.icon
                  aria-hidden="true"
                  className="size-4.5 text-primary"
                />
                <span className="text-sm font-semibold">{benefit.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <Link
            href="/"
            className="mb-7 inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/25 lg:hidden"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/15">
              <HouseHeart aria-hidden="true" className="size-5" />
            </span>
            <span className="text-xl font-semibold tracking-[-0.045em]">
              Room<span className="text-primary">zi</span>
            </span>
          </Link>

          <div className="surface-card p-5 sm:p-8 lg:p-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
              {isLogin ? (
                <KeyRound aria-hidden="true" className="size-5.5" />
              ) : (
                <UserRound aria-hidden="true" className="size-5.5" />
              )}
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {isLogin
                ? "Log in to view your profile and continue your housing search."
                : "Join Roomzi to create your profile and connect with local communities."}
            </p>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-7 w-full"
              disabled={!googleEnabled || isGooglePending || isPending}
              onClick={handleGoogleSignIn}
            >
              {isGooglePending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <GoogleMark />
              )}
              Continue with Google
            </Button>
            {!googleEnabled ? (
              <p className="mt-2 text-center text-xs font-medium leading-5 text-muted-foreground">
                Google sign-in is not enabled in Supabase yet. Use email below.
              </p>
            ) : null}

            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                or use email
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form action={formAction} className="space-y-5">
              <input type="hidden" name="next" value={nextPath} />

              {!isLogin ? (
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-semibold">
                    Full name
                  </label>
                  <div className="relative">
                    <UserRound
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      minLength={2}
                      required
                      placeholder="Your name"
                      className={inputClassName}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold">
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    placeholder="you@example.com"
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-semibold">
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    minLength={isLogin ? undefined : 8}
                    required
                    placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
                    className={cn(inputClassName, "pr-12")}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Eye aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {!isLogin ? (
                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="text-sm font-semibold"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      placeholder="Repeat your password"
                      className={inputClassName}
                    />
                  </div>
                </div>
              ) : null}

              {visibleMessage ? (
                <div
                  role={messageStatus === "error" ? "alert" : "status"}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium leading-5",
                    messageStatus === "error"
                      ? "border-destructive/25 bg-destructive/8 text-destructive"
                      : "border-secondary bg-secondary/55 text-secondary-foreground",
                  )}
                >
                  {messageStatus === "error" ? (
                    <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  )}
                  {visibleMessage}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isPending || isGooglePending}
              >
                {isPending ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {isLogin ? "Log in" : "Create account"}
                {!isPending ? (
                  <ArrowRight aria-hidden="true" className="size-4" />
                ) : null}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? "New to Roomzi?" : "Already have an account?"}{" "}
              <Link
                href={isLogin ? `/signup?next=${encodeURIComponent(nextPath)}` : `/login?next=${encodeURIComponent(nextPath)}`}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {isLogin ? "Create an account" : "Log in"}
              </Link>
            </p>
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Your session is securely stored in browser cookies.
          </p>
        </section>
      </div>
    </main>
  );
}
