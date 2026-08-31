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
