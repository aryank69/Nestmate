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

  if (!placeholder) {
    return urlTemplate;
  }

  if (!password) {
    throw new Error(
      `DATABASE_PASSWORD is required while ${variableName} contains a password placeholder.`,
    );
  }

  return urlTemplate.replace(placeholder, encodeURIComponent(password));
}
