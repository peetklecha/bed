// Minimal replacement for deno std's http/cookie.ts (getCookies/setCookie).

/** A cookie to send with `ctx.setCookie`. */
export interface Cookie {
  /** The cookie's name. */
  name: string;
  /** The cookie's value. */
  value: string;
  /** When the cookie expires (`Expires`). */
  expires?: Date;
  /** Seconds until the cookie expires (`Max-Age`). */
  maxAge?: number;
  /** Hosts the cookie is sent to (`Domain`). */
  domain?: string;
  /** Path prefix the cookie is sent for (`Path`). */
  path?: string;
  /** Send only over HTTPS (`Secure`). */
  secure?: boolean;
  /** Hide from client-side JavaScript (`HttpOnly`). */
  httpOnly?: boolean;
  /** Cross-site sending policy (`SameSite`). */
  sameSite?: "Strict" | "Lax" | "None";
}

/** Parse the `Cookie` header into a record of names to values. */
export function getCookies(headers: Headers): Record<string, string> {
  const cookie = headers.get("Cookie");
  if (cookie == null) return {};
  const out: Record<string, string> = {};
  for (const kv of cookie.split(";")) {
    const [name, ...rest] = kv.split("=");
    if (!name.trim()) continue;
    out[name.trim()] = rest.join("=");
  }
  return out;
}

/** Append a `Set-Cookie` header for `cookie`. */
export function setCookie(headers: Headers, cookie: Cookie): void {
  const parts = [`${cookie.name}=${cookie.value}`];
  if (cookie.secure) parts.push("Secure");
  if (cookie.httpOnly) parts.push("HttpOnly");
  if (cookie.maxAge !== undefined) parts.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (cookie.sameSite) parts.push(`SameSite=${cookie.sameSite}`);
  if (cookie.path) parts.push(`Path=${cookie.path}`);
  if (cookie.expires) parts.push(`Expires=${cookie.expires.toUTCString()}`);
  headers.append("Set-Cookie", parts.join("; "));
}
