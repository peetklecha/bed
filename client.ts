/**
 * A typed browser client for a bed API. Paths and arguments are checked
 * against the server's route tree type.
 *
 * @example
 * ```ts
 * import { api } from "@peetklecha/bed/client";
 * import type { API } from "../server/api.ts"; // export type API = typeof config
 *
 * const client = api<API>({});
 * const { err, res } = await client.get.users[userId]();
 * if (err === null) console.log(res);
 * ```
 *
 * @module
 */
import type { Sendable } from "./lib/types.ts";
import {
  DELETE,
  GET,
  type MethodSymbol,
  PARAM,
  POST,
  PUT,
} from "./lib/symbols.ts";

export type { MethodSymbol };

/** Options for `api`. */
export type ClientConfig = {
  /** URL that request paths are resolved against. Defaults to the page's origin. */
  baseUrl?: string;
};

/**
 * The result of a request: on success `err` is `null` and `res` is the parsed
 * JSON body; on failure `err` is the status code and `res` the status text.
 */
export type ApiResult<T = unknown> = {
  err: number;
  res: string;
} | {
  err: null;
  res: T;
};

function collector(
  method: "GET" | "PUT" | "POST" | "DELETE",
  config: ClientConfig,
  accum: string[] = [],
): unknown {
  async function finalize(
    arg: Record<string, string> = {},
  ): Promise<ApiResult> {
    let route = accum.join("/");
    if (method === "GET" || method === "DELETE") {
      if (Object.keys(arg).length) {
        route += "?" + new URLSearchParams(arg);
      }
    }
    const path = new URL(route, config.baseUrl ?? origin);
    const init: RequestInit = { method };
    if (method === "POST" || method === "PUT") init.body = JSON.stringify(arg);
    const res = await fetch(path, init);
    if (res.ok) {
      return { err: null, res: await res.json() };
    } else {
      return { err: res.status, res: res.statusText };
    }
  }
  return new Proxy(finalize, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      return collector(method, config, [...accum, prop]);
    },
  }) as unknown;
}

/**
 * Create a client for the API whose route tree type is `API`. Build a path by
 * property access under a method (`client.get.users.admins`), then call it:
 * `GET`/`DELETE` take the query, `POST`/`PUT` take the JSON body.
 */
export const api = <API extends ClientsideAPI>(
  config: ClientConfig,
): Client<API> => ({
  get: collector("GET", config),
  put: collector("PUT", config),
  post: collector("POST", config),
  delete: collector("DELETE", config),
} as Client<API>);

/** Any route handler, as seen by the client. */
export type ClientsideHandler = (ctx: never) => Promise<Sendable> | Sendable;

/** The shape of a route tree, as seen by the client. */
export type ClientsideAPI = {
  [key: string]: ClientsideAPI;
  [PARAM]?: ClientsideAPI;
  [GET]?: ClientsideHandler;
  [PUT]?: ClientsideHandler;
  [POST]?: ClientsideHandler;
  [DELETE]?: ClientsideHandler;
};

/** A client for `Config`, with a path builder for each method. */
export type Client<Config extends ClientsideAPI> = {
  /** Paths with `GET` handlers. */
  get: Midpoint<typeof GET, Config>;
  /** Paths with `PUT` handlers. */
  put: Midpoint<typeof PUT, Config>;
  /** Paths with `POST` handlers. */
  post: Midpoint<typeof POST, Config>;
  /** Paths with `DELETE` handlers. */
  delete: Midpoint<typeof DELETE, Config>;
};

/** A point in a path: callable if the route has a `Method` handler. */
export type Midpoint<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
> = Method extends keyof Config
  ? Trigger<Method, Config> & NonTerminal<Method, Config>
  : NonTerminal<Method, Config>;

/** The child routes reachable from a point in a path. */
export type NonTerminal<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
> = {
  [
    Key in keyof Config as Key extends typeof PARAM ? string | number
      : Key extends string ? Key
      : never
  ]: Midpoint<Method, Config[Key]>;
};

/** The promised result of calling handler `Func` through the client. */
export type Result<
  // deno-lint-ignore no-explicit-any
  Func extends (...args: any[]) => any,
> = Promise<ApiResult<Await<ReturnType<Func>>>>;

/** A function from `ParamType` to `ReturnType`. */
export type Effect<ParamType, ReturnType> = (arg: ParamType) => ReturnType;

/**
 * The call signature for a route's `Method` handler, taking its query
 * (`GET`/`DELETE`) or body (`POST`/`PUT`) type.
 */
export type Trigger<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
  // deno-lint-ignore no-explicit-any
> = Config[Method] extends (...args: any[]) => any
  ? Parameters<Config[Method]> extends [infer Ctx]
    ? Method extends typeof GET | typeof DELETE
      ? "query" extends keyof Ctx
        ? Ctx["query"] extends never ? () => Result<Config[Method]>
        : Effect<Ctx["query"], Result<Config[Method]>>
      : never
    : "getBody" extends keyof Ctx
      // deno-lint-ignore no-explicit-any
      ? Ctx["getBody"] extends (...args: any) => any
        ? Ctx["getBody"] extends never ? () => Result<Config[Method]>
        : Effect<Await<ReturnType<Ctx["getBody"]>>, Result<Config[Method]>>
      : never
    : never
  : never
  : never;

/** The resolved type of `T` if it's a promise, else `T`. */
export type Await<T> = T extends Promise<infer U> ? U : T;
