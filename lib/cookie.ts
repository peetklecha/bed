// Minimal replacement for deno std's http/cookie.ts (getCookies/setCookie).

export interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

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

export function setCookie(headers: Headers, cookie: Cookie) {
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
