import {
  ALIAS,
  DELETE,
  ERROR,
  FALLBACK,
  GET,
  PARAM,
  PARENT,
  POST,
  PUT,
  USE,
} from "./symbols.ts";
import type { Context, ErrorContext } from "./context.ts";

/**
 * A route tree, as passed to `new Server`. String keys are path segments;
 * symbol keys hold handlers and settings for the route.
 *
 * @example
 * ```ts
 * const api = {
 *   [USE]: [logging],
 *   users: {
 *     [GET]: listUsers,
 *     [PARAM]: { [ALIAS]: "id", [GET]: getUser },
 *   },
 * } satisfies Config<Context>;
 * ```
 */
export interface Config<
  UserDefinedContext extends Context,
> {
  /** A child route for the path segment `key`. */
  [key: string]: Config<UserDefinedContext>;
  /** A parametric child route, matching any path segment. */
  [PARAM]?: ParamConfig<UserDefinedContext>;
  /** Middleware run for every request to this route or below it. */
  [USE]?: Handler<UserDefinedContext>[];
  /** Handler for `GET` requests to this route. */
  [GET]?: Handler<UserDefinedContext>;
  /** Handler for `PUT` requests to this route. */
  [PUT]?: Handler<UserDefinedContext>;
  /** Handler for `POST` requests to this route. */
  [POST]?: Handler<UserDefinedContext>;
  /** Handler for `DELETE` requests to this route. */
  [DELETE]?: Handler<UserDefinedContext>;
  /** Handler for requests at or below this route that match no endpoint. */
  [FALLBACK]?: Handler<UserDefinedContext>;
  /** Handler for errors thrown by handlers at or below this route. */
  [ERROR]?: ErrorHandler;
}

/** A parametric route: a `Config` with the name of its parameter. */
export interface ParamConfig<UserDefinedContext extends Context>
  extends Config<UserDefinedContext> {
  /** The parameter's name, as it appears in `ctx.params`. */
  [ALIAS]: string;
}

/** Internal: a `Config` after the server has linked each route to its parent. */
export interface AnnotatedConfig<UserDefinedContext extends Context>
  extends Config<UserDefinedContext> {
  /** A child route for the path segment `key`. */
  [key: string]: AnnotatedConfig<UserDefinedContext>;
  /** The parent route, or `null` at the root. */
  [PARENT]: AnnotatedConfig<UserDefinedContext> | null;
  /** The parameter's name, if this is a parametric route. */
  [ALIAS]?: string;
}

/** Internal: an annotated route that has a parametric child. */
export interface AnnotatedConfigWithParam<UserDefinedContext extends Context>
  extends AnnotatedConfig<UserDefinedContext> {
  /** The parametric child route. */
  [PARAM]: AnnotatedParamConfig<UserDefinedContext>;
}

/** Internal: an annotated parametric route. */
export interface AnnotatedParamConfig<UserDefinedContext extends Context>
  extends AnnotatedConfig<UserDefinedContext> {
  /** The parameter's name, as it appears in `ctx.params`. */
  [ALIAS]: string;
}

/** What a handler may return, directly or as a promise. */
export type HandlerReturnValue =
  | Promise<void | Sendable>
  | Sendable
  | void;

/**
 * A route handler or middleware. It receives the request context and returns
 * the response: a `Response` is sent as-is, a `BodyInit` is sent as the body,
 * `null`/`undefined` sends an empty body, and anything else is sent as JSON.
 */
export type Handler<UserDefinedContext extends Context> = (
  ctx: UserDefinedContext,
) => HandlerReturnValue;

/** An `[ERROR]` handler. The error being handled is `ctx.err`. */
export type ErrorHandler = (errCtx: ErrorContext) => HandlerReturnValue;

/** A handler to run, paired with the nearest error handler in scope. */
export type HandlerStep<UserDefinedContext extends Context> = {
  /** The handler to run. */
  handler: Handler<UserDefinedContext>;
  /** The nearest error handler at the handler's place in the route tree. */
  err?: ErrorHandler;
};

/** A value a handler can send as a response body. */
export type Sendable =
  | BodyInit
  | null
  | unknown[]
  | (object & {});

/** A JSON-compatible value. */
export type Recievable = string | boolean | null | number | Recievable[] | {
  [key: string]: Recievable;
};

/** Internal: whether a route is parametric. */
export function isParamConfig<UserDefinedContext extends Context>(
  config: Config<UserDefinedContext>,
): config is ParamConfig<UserDefinedContext> {
  return ALIAS in config;
}

/** Internal: whether an annotated route has a parametric child. */
export function hasParam<UserDefinedContext extends Context>(
  endpoint: AnnotatedConfig<UserDefinedContext>,
): endpoint is AnnotatedConfigWithParam<UserDefinedContext> {
  return PARAM in endpoint;
}

/** The HTTP methods bed supports. */
export type SupportedMethodString = "GET" | "PUT" | "POST" | "DELETE";

/**
 * A context whose `query` has the given shape.
 *
 * @example
 * ```ts
 * const search = ({ query }: WithQuery<Context, { q: string }>) => find(query.q);
 * ```
 */
export type WithQuery<UserContext extends Context, Query extends {}> =
  & Omit<UserContext, "query">
  & {
    /** The parsed query string. */
    query: Query;
  };

/**
 * A context whose `getBody()` resolves to the given shape.
 *
 * @example
 * ```ts
 * const create = async ({ getBody }: WithBody<Context, { name: string }>) =>
 *   insert(await getBody());
 * ```
 */
export type WithBody<UserContext extends Context, Body extends {}> =
  & Omit<UserContext, "getBody">
  & {
    /** The parsed JSON request body. */
    getBody: () => Promise<Body>;
  };
