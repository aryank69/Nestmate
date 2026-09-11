"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeNextPath, resolveTrustedSiteOrigin } from "@/lib/auth";
import { trackProductAnalyticsEvent } from "@/lib/analytics.server";
import { postAuthPath } from "@/lib/onboarding-data";
import { prisma } from "@/lib/prisma";
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
  const origin = requestHeaders.get("origin");
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const fallbackOrigin = origin ??
    (host ? `${protocol}://${host}` : "http://localhost:3002");

  return resolveTrustedSiteOrigin({
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    fallbackOrigin,
    production: process.env.NODE_ENV === "production",
  });
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
      "Your login worked, but Roomzi could not finish loading your profile. Please try again.",
    );
  }

  redirect(await postAuthPath(data.user.id, next));
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
  let origin: string;
  try {
    origin = await getRequestOrigin();
  } catch (configurationError) {
    console.error("[auth:signup] Invalid production site URL", {
      error:
        configurationError instanceof Error
          ? configurationError.message
          : "Unknown configuration error",
    });
    return errorState(
      "Account creation is temporarily unavailable because sign-in links are not configured correctly.",
    );
  }
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
      const user = await ensureUserProfile({
        id: data.user.id,
        email: data.user.email,
        name,
      });
      await trackProductAnalyticsEvent(user.id, {
        name: "SIGNUP_COMPLETED",
        properties: { method: "email" },
      });
    } catch (profileError) {
      console.error("[auth:signup] Profile synchronization failed", profileError);
      if (data.session) {
        await supabase.auth.signOut();
      }
      return errorState(
        "Your account was created, but Roomzi could not finish setting up your profile. Please try logging in again.",
      );
    }
  }

  if (data.user && !data.session && (data.user.identities?.length ?? 0) > 0) {
    try {
      const user = await prisma.user.findUnique({
        where: { authUserId: data.user.id },
        select: { id: true },
      });
      if (user) {
        await trackProductAnalyticsEvent(user.id, {
          name: "SIGNUP_COMPLETED",
          properties: { method: "email" },
        });
      }
    } catch (analyticsError) {
      console.error("[analytics] Signup lookup failed", {
        error:
          analyticsError instanceof Error
            ? analyticsError.message
            : "Unknown error",
      });
    }
  }

  if (data.session) {
    redirect(await postAuthPath(data.session.user.id, next));
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
