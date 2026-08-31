export type AuthOperation = "login" | "signup" | "oauth" | "callback";

export type AuthErrorLike = {
  code?: string;
  message: string;
  status?: number;
};

const fallbackMessages: Record<AuthOperation, string> = {
  login: "We could not log you in. Please check your details and try again.",
  signup: "We could not create your account. Please check your details and try again.",
  oauth: "We could not start Google sign-in. Please use email or try again later.",
  callback: "We could not finish signing you in. Please try again.",
};

function normalizedMessage(error: AuthErrorLike) {
  return error.message.trim().replace(/^\d{3}:\s*/, "");
}

export function getFriendlyAuthError(
  error: AuthErrorLike,
  operation: AuthOperation,
) {
  const code = error.code?.toLowerCase();
  const message = normalizedMessage(error);
  const normalized = message.toLowerCase();

  switch (code) {
    case "invalid_credentials":
      return "Email or password is incorrect. Please try again.";
    case "email_not_confirmed":
      return "Please confirm your email before logging in.";
    case "email_address_invalid":
      return "Supabase could not accept that email address. Check it for typos or use a different email.";
    case "email_exists":
    case "user_already_exists":
      return "An account with this email already exists. Log in instead.";
    case "signup_disabled":
      return "New email sign-ups are currently disabled. Please try again later.";
    case "weak_password":
      return message || "Choose a stronger password and try again.";
    case "email_address_not_authorized":
      return "This email cannot receive confirmation messages from the current Supabase email service. Use an authorized address or configure custom SMTP.";
    case "over_email_send_rate_limit":
      return "A confirmation email was sent recently. Please wait a minute before trying again.";
    case "over_request_rate_limit":
    case "too_many_requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "captcha_failed":
      return "The security check did not pass. Refresh the page and try again.";
    case "flow_state_not_found":
    case "flow_state_expired":
    case "bad_code_verifier":
    case "otp_expired":
      return "This sign-in link has expired or was already used. Start again from the login page.";
    case "session_not_found":
      return "Your sign-in session has expired. Please log in again.";
    case "unexpected_failure":
      if (normalized.includes("database")) {
        return "Supabase could not finish setting up your account because of a database error. Please try again.";
      }
      break;
    case "validation_failed":
      if (normalized.includes("provider") && normalized.includes("not enabled")) {
        return "Google sign-in is not enabled for this Supabase project. Please use email for now.";
      }
      break;
  }

  if (normalized.includes("invalid login credentials")) {
    return "Email or password is incorrect. Please try again.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email before logging in.";
  }

  if (normalized.includes("already registered")) {
    return "An account with this email already exists. Log in instead.";
  }

  if (normalized.includes("provider") && normalized.includes("not enabled")) {
    return "Google sign-in is not enabled for this Supabase project. Please use email for now.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  // Supabase Auth API messages are intended for the requesting client. Keeping a
  // short, non-empty message makes new provider errors useful instead of silently
  // collapsing every failure into the same generic response.
  if (message && message.length <= 240) {
    return message;
  }

  return fallbackMessages[operation];
}

export function logAuthError(
  operation: AuthOperation,
  error: AuthErrorLike,
) {
  console.error(`[auth:${operation}] Supabase Auth request failed`, {
    code: error.code ?? "unknown",
    status: error.status ?? "unknown",
    message: error.message,
  });
}
