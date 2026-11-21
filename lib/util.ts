export function isBodyInit(obj: unknown): obj is BodyInit {
  return typeof obj === "string" ||
    obj instanceof Blob ||
    obj instanceof ArrayBuffer ||
    obj instanceof FormData ||
    obj instanceof URLSearchParams ||
    obj instanceof ReadableStream;
}

export function assignHeaders(init0: HeadersInit, ...inits: HeadersInit[]) {
  const headers = new Headers(init0);
  for (const init of inits) {
    if (init instanceof Headers || Array.isArray(init)) {
      for (const [key, value] of init as Iterable<[string, string]>) {
        headers.append(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(init)) {
        headers.append(key, value);
      }
    }
  }
  return headers;
}
