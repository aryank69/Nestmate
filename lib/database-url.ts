const passwordPlaceholders = [
  "[YOUR-PASSWORD]",
  "[PASSWORD]",
  "DATABASE_PASSWORD",
] as const;

export function resolveDatabaseUrl(
  urlTemplate: string | undefined,
  password: string | undefined,
  variableName: "DATABASE_URL" | "DIRECT_URL",
) {
  if (!urlTemplate) {
    throw new Error(`${variableName} is required.`);
  }

  const placeholder = passwordPlaceholders.find((value) =>
    urlTemplate.includes(value),
  );

  let resolved = urlTemplate;
  if (placeholder) {
    if (!password) {
      throw new Error(
        `DATABASE_PASSWORD is required while ${variableName} contains a password placeholder.`,
      );
    }
    resolved = resolved.replace(placeholder, encodeURIComponent(password));
  }

  const sslMode = resolved.match(/[?&]sslmode=([^&]*)/i)?.[1]?.toLowerCase();
  if (!sslMode) {
    resolved += `${resolved.includes("?") ? "&" : "?"}uselibpqcompat=true&sslmode=require`;
  } else if (!new Set(["require", "verify-ca", "verify-full"]).has(sslMode)) {
    throw new Error(
      `${variableName} must require TLS with sslmode=require, verify-ca, or verify-full.`,
    );
  } else if (
    sslMode === "require" &&
    !/[?&]uselibpqcompat=true(?:&|$)/i.test(resolved)
  ) {
    resolved += "&uselibpqcompat=true";
  }

  return resolved;
}
