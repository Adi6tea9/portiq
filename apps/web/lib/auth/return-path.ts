const INTERNAL_ORIGIN = "http://portiq.local";

const AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
] as const;

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Accepts only same-origin absolute paths. Protocol-relative URLs, external
 * URLs, backslashes and malformed values are rejected.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (value.includes("\\")) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== INTERNAL_ORIGIN) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Post-login return paths must not point back at auth screens, otherwise a
 * missing session could create a redirect loop.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  const path = safeInternalPath(value);

  if (!path) {
    return null;
  }

  let pathname: string;

  try {
    pathname = new URL(path, INTERNAL_ORIGIN).pathname;
  } catch {
    return null;
  }

  return isAuthPath(pathname) ? null : path;
}

export function loginPath(returnTo?: string | null): string {
  const safe = safeReturnTo(returnTo);

  if (!safe) {
    return "/login";
  }

  return `/login?returnTo=${encodeURIComponent(safe)}`;
}
