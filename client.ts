/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import type { Sendable } from "./lib/types.ts";
import {
  DELETE,
  GET,
  type MethodSymbol,
  PARAM,
  POST,
  PUT,
} from "./lib/symbols.ts";

type ClientConfig = {
  baseUrl?: string;
};

type ApiResult<T = unknown> = {
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

export const api = <API extends ClientsideAPI>(config: ClientConfig) => ({
  get: collector("GET", config),
  put: collector("PUT", config),
  post: collector("POST", config),
  delete: collector("DELETE", config),
} as Client<API>);

export type ClientsideHandler = (ctx: never) => Promise<Sendable> | Sendable;

export type ClientsideAPI = {
  [key: string]: ClientsideAPI;
  [PARAM]?: ClientsideAPI;
  [GET]?: ClientsideHandler;
  [PUT]?: ClientsideHandler;
  [POST]?: ClientsideHandler;
  [DELETE]?: ClientsideHandler;
};

export type Client<Config extends ClientsideAPI> = {
  get: Midpoint<typeof GET, Config>;
  put: Midpoint<typeof PUT, Config>;
  post: Midpoint<typeof POST, Config>;
  delete: Midpoint<typeof DELETE, Config>;
};

export type Midpoint<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
> = Method extends keyof Config
  ? Trigger<Method, Config> & NonTerminal<Method, Config>
  : NonTerminal<Method, Config>;

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

// export type Route<
//   Method extends MethodSymbol,
//   Config extends ClientsideAPI,
// > =
//   & {
//     [
//       Key in keyof Config as Key extends typeof PARAM ? string | number
//         : Key extends string ? Key
//         : never
//     ]: Route<Method, Config[Key]>;
//   }
//   & (Method extends keyof Config ? Trigger<Method, Config>
//     : {});
// & (HasParam<keyof Config> extends never ? {}
//   : Record<
//     string,
//     Route<Method, Config[HasParam<keyof Config>]>
//   >);

type Result<
  Func extends (...args: any[]) => any,
> = Promise<ApiResult<Await<ReturnType<Func>>>>;

type Effect<ParamType, ReturnType> = (arg: ParamType) => ReturnType;

export type Trigger<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
> = Config[Method] extends (...args: any[]) => any
  ? Parameters<Config[Method]> extends [infer Ctx]
    ? Method extends typeof GET | typeof DELETE
      ? "query" extends keyof Ctx
        ? Ctx["query"] extends never ? () => Result<Config[Method]>
        : "query" extends keyof Ctx
          ? Effect<Ctx["query"], Result<Config[Method]>> //(query: Ctx["query"]) => Result<Config[Method]>
        : never
      : never
    : "getBody" extends keyof Ctx
      ? Ctx["getBody"] extends (...args: any) => any
        ? Ctx["getBody"] extends never ? () => Result<Config[Method]>
        : Effect<Await<ReturnType<Ctx["getBody"]>>, Result<Config[Method]>>
      : never
    : never
  : never
  : never;

// type HasParam<Z extends {}> = keyof {
//   [Key in Z as Key extends `$${string}` ? Key : never]: Key;
// };

type Await<T> = T extends Promise<infer U> ? U : T;

// const x = {
//   hello: {
//     [GET]: (ctx: Context) => {
//       return {};
//     },
//   },
// };

// type Method = typeof GET;
// type Config = typeof x.hello;

// type z = Trigger<typeof GET, typeof x.hello>;
// type m = Midpoint<typeof GET, typeof x.hello>;
// type m_ = typeof GET extends keyof typeof x.hello ? 1 : 0;
// type m__1 = Trigger<Method, Config>;
// type m__2 = NonTerminal<Method, Config>;
// type m__1_ = Config[Method] extends (...args: any) => any ? 1 : 0;
// type m__1__ = Parameters<Config[Method]> extends [infer Ctx] ? Ctx : never;
// type m__1___ = never extends never ? () => Result<Config[Method]> : 0;
// // type m__1____ = Effect<never, Result<Config[Method]>>;

// type zz = Method extends typeof GET | typeof DELETE ? Ctxx : never;
// type zzz = m__1__ extends { query: infer Query } ? Query : 0;

// // type c = Effect<never, 1>;

// type _Effect<X, Y> = (arg: X) => Y;

// type Y<Z> = "a" extends keyof Z ? (arg: Z["a"]) => void : never;
// type YYY<Z> = "a" extends keyof Z ? _Effect<Z["a"], void> : never;
// type YY<Z> = "a" extends keyof Z ? Z["a"] : never;
