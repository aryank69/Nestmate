"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeNextPath } from "@/lib/auth";
import { ensureUserProfile } from "@/lib/profile-data";
import {
  getFriendlyAuthError,
  logAuthError,
} from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthFormState } from "@/types/auth";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorState(message: string): AuthFormState {
  return { status: "error", message };
}

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const origin = requestHeaders.get("origin");
  if (origin) {
    return origin;
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeNextPath(formData.get("next"));

  if (!emailPattern.test(email)) {
    return errorState("Enter a valid email address.");
  }

  if (!password) {
    return errorState("Enter your password.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logAuthError("login", error);
    return errorState(getFriendlyAuthError(error, "login"));
  }

  const fullName = data.user.user_metadata?.full_name;
  try {
    await ensureUserProfile({
      id: data.user.id,
      email: data.user.email,
      name: typeof fullName === "string" ? fullName : null,
    });
  } catch (profileError) {
    console.error("[auth:login] Profile synchronization failed", profileError);
    await supabase.auth.signOut();
    return errorState(
      "Your login worked, but NestMate could not finish loading your profile. Please try again.",
    );
  }

  redirect(next);
}

export async function signupAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = getSafeNextPath(formData.get("next"));

  if (name.length < 2) {
    return errorState("Enter your full name.");
  }

  if (!emailPattern.test(email)) {
    return errorState("Enter a valid email address.");
  }

  if (password.length < 8) {
    return errorState("Use at least 8 characters for your password.");
  }

  if (password !== confirmPassword) {
    return errorState("Passwords do not match.");
  }

  const supabase = await createSupabaseServerClient();
  const origin = await getRequestOrigin();
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    logAuthError("signup", error);
    return errorState(getFriendlyAuthError(error, "signup"));
  }

  // With email confirmation enabled, Supabase can return an obfuscated user for
  // an existing address. Only synchronize here when signup created a session;
  // confirmed-email flows are provisioned by the database trigger and rechecked
  // on first login.
  if (data.user && data.session) {
    try {
      await ensureUserProfile({
        id: data.user.id,
        email: data.user.email,
        name,
      });
    } catch (profileError) {
      console.error("[auth:signup] Profile synchronization failed", profileError);
      if (data.session) {
        await supabase.auth.signOut();
      }
      return errorState(
        "Your account was created, but NestMate could not finish setting up your profile. Please try logging in again.",
      );
    }
  }

  if (data.session) {
    redirect(next);
  }

  return {
    status: "success",
    message:
      "Check your inbox to confirm your email, then come back to log in.",
  };
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?message=You%20have%20been%20logged%20out.");
}
