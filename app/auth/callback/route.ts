import { NextResponse } from "next/server";

import { trackProductAnalyticsEvent } from "@/lib/analytics.server";
import { getSafeNextPath, resolveTrustedSiteOrigin } from "@/lib/auth";
import { postAuthPath } from "@/lib/onboarding-data";
import { ensureUserProfile } from "@/lib/profile-data";
import {
  getFriendlyAuthError,
  logAuthError,
  type AuthErrorLike,
} from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectToLogin(
  siteOrigin: string,
  next: string,
  error: AuthErrorLike,
) {
  logAuthError("callback", error);
  const errorUrl = new URL("/login", siteOrigin);
  errorUrl.searchParams.set("next", next);
  errorUrl.searchParams.set(
    "error",
    getFriendlyAuthError(error, "callback"),
  );
  return NextResponse.redirect(errorUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  let siteOrigin: string;
  try {
    siteOrigin = resolveTrustedSiteOrigin({
      configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      fallbackOrigin: requestUrl.origin,
      production: process.env.NODE_ENV === "production",
    });
  } catch (configurationError) {
    console.error("[auth:callback] Invalid production site URL", {
      error:
        configurationError instanceof Error
          ? configurationError.message
          : "Unknown configuration error",
    });
    return new Response("Authentication is temporarily unavailable.", {
      status: 500,
    });
  }
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const providerError = requestUrl.searchParams.get("error_description");

  if (providerError) {
    return redirectToLogin(siteOrigin, next, {
      code:
        requestUrl.searchParams.get("error_code") ??
        requestUrl.searchParams.get("error") ??
        "oauth_callback_error",
      message: providerError,
      status: 400,
    });
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectToLogin(siteOrigin, next, error);
    }

    const fullName = data.user.user_metadata?.full_name;
    try {
      const user = await ensureUserProfile({
        id: data.user.id,
        email: data.user.email,
        name: typeof fullName === "string" ? fullName : null,
      });
      const provider = data.user.app_metadata?.provider;
      if (provider === "google") {
        const createdAt = new Date(data.user.created_at).getTime();
        if (Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60_000) {
          await trackProductAnalyticsEvent(user.id, {
            name: "SIGNUP_COMPLETED",
            properties: { method: "google" },
          });
        }
      }
    } catch (profileError) {
      console.error("[auth:callback] Profile synchronization failed", profileError);
      await supabase.auth.signOut();
      return redirectToLogin(siteOrigin, next, {
        code: "profile_sync_failed",
        message:
          "Your account was verified, but Roomzi could not finish setting up your profile. Please log in again.",
        status: 500,
      });
    }

    const destination = await postAuthPath(data.user.id, next);
    return NextResponse.redirect(`${siteOrigin}${destination}`);
  }

  return redirectToLogin(siteOrigin, next, {
    code: "missing_auth_code",
    message: "The sign-in link is missing or no longer valid. Please try again.",
    status: 400,
  });
}
