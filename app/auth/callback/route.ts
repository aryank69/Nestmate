import { NextResponse } from "next/server";

import { getSafeNextPath } from "@/lib/auth";
import { ensureUserProfile } from "@/lib/profile-data";
import {
  getFriendlyAuthError,
  logAuthError,
  type AuthErrorLike,
} from "@/lib/supabase/auth-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectToLogin(
  requestUrl: URL,
  next: string,
  error: AuthErrorLike,
) {
  logAuthError("callback", error);
  const errorUrl = new URL("/login", requestUrl.origin);
  errorUrl.searchParams.set("next", next);
  errorUrl.searchParams.set(
    "error",
    getFriendlyAuthError(error, "callback"),
  );
  return NextResponse.redirect(errorUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const providerError = requestUrl.searchParams.get("error_description");

  if (providerError) {
    return redirectToLogin(requestUrl, next, {
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
      return redirectToLogin(requestUrl, next, error);
    }

    const fullName = data.user.user_metadata?.full_name;
    try {
      await ensureUserProfile({
        id: data.user.id,
        email: data.user.email,
        name: typeof fullName === "string" ? fullName : null,
      });
    } catch (profileError) {
      console.error("[auth:callback] Profile synchronization failed", profileError);
      await supabase.auth.signOut();
      return redirectToLogin(requestUrl, next, {
        code: "profile_sync_failed",
        message:
          "Your account was verified, but NestMate could not finish setting up your profile. Please log in again.",
        status: 500,
      });
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProtocol =
      request.headers.get("x-forwarded-proto") ?? "https";

    if (process.env.NODE_ENV !== "development" && forwardedHost) {
      return NextResponse.redirect(
        `${forwardedProtocol}://${forwardedHost}${next}`,
      );
    }

    return NextResponse.redirect(`${requestUrl.origin}${next}`);
  }

  return redirectToLogin(requestUrl, next, {
    code: "missing_auth_code",
    message: "The sign-in link is missing or no longer valid. Please try again.",
    status: 400,
  });
}
