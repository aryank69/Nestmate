export function getSafeNextPath(
  value: FormDataEntryValue | string | null | undefined,
) {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value;
  }

  return "/profile";
}

export function resolveTrustedSiteOrigin(input: {
  configuredSiteUrl: string | undefined;
  fallbackOrigin: string;
  production: boolean;
}) {
  const configured = input.configuredSiteUrl?.trim();
  const rawOrigin = configured || input.fallbackOrigin;
  let url: URL;

  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must contain only the app origin.");
  }

  if (input.production) {
    if (!configured) {
      throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
    }
    if (url.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production.");
    }
  } else if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.");
  }

  return url.origin;
}
