/**
 * Only allow same-origin relative paths as post-auth destinations so a crafted
 * `?next=` can never bounce a user to an external site (open redirect).
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}
