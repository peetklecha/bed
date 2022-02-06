import { AnnotatedConfig, Handler, hasFallback } from "./types.ts";
import { FALLBACK, PARENT, USE } from "./symbols.ts";

export function push<T>(arr: T[], content: T | T[]) {
  if (Array.isArray(content)) arr.push(...content);
  else arr.push(content);
}

export function loadMiddleware(
  endpoint: AnnotatedConfig,
  endpointSet: boolean,
  handlers: Handler[],
) {
  let parentEndpoint: AnnotatedConfig | null = endpoint;
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

export class PublicError extends Error {
  errorMessageCanBeViewedByClient = true;
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
