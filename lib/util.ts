import { AnnotatedConfig, Handler, hasFallback } from "./types.ts";
import { FALLBACK, PARENT, USE } from "./symbols.ts";
import type { Context } from "./context.ts";

export function push<T>(arr: T[], content: T | T[]) {
  if (Array.isArray(content)) arr.push(...content);
  else arr.push(content);
}

export function loadMiddleware<UserDefinedContext extends Context>(
  endpoint: AnnotatedConfig<UserDefinedContext>,
  endpointSet: boolean,
  handlers: Handler<UserDefinedContext>[],
) {
  let parentEndpoint: AnnotatedConfig<UserDefinedContext> | null = endpoint;
  while (parentEndpoint) {
    if (!endpointSet && hasFallback(parentEndpoint)) {
      push(handlers, parentEndpoint[FALLBACK]);
      endpointSet = true;
    }
    const middleware = parentEndpoint[USE] || [];
    handlers.unshift(...middleware);
    parentEndpoint = parentEndpoint[PARENT];
  }
}

export function isBodyInit(obj: unknown): obj is BodyInit {
  return typeof obj === "string" ||
    obj instanceof Blob ||
    obj instanceof ArrayBuffer ||
    obj instanceof FormData ||
    obj instanceof URLSearchParams ||
    obj instanceof ReadableStream;
}

export function assignHeaders(headers: HeadersInit, ...inits: HeadersInit[]) {
  headers = new Headers(headers);
  for (const init of inits) {
    if (init instanceof Headers || Array.isArray(init)) {
      for (const [key, value] of init) headers.append(key, value);
    } else {
      for (const [key, value] of Object.entries(init)) {
        headers.append(key, value);
      }
    }
  }
  return headers;
}
