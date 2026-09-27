/**
 * Only allow same-origin relative paths as post-auth destinations so a crafted
 * `?next=` can never bounce a user to an external site (open redirect).
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) {
    return "/";
  }
  try {
    const url = new URL(value, "https://unbound.invalid");
    if (url.origin !== "https://unbound.invalid") return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
