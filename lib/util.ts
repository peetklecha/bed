import { AnnotatedConfig, Handler, hasFallback } from "./types.ts";
import { FALLBACK, PARENT, USE } from "./symbols.ts";
import type { Context } from './context.ts';

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

export class PublicError extends Error {
  errorMessageCanBeViewedByClient = true;
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
