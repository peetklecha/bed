import { DELETE, GET, PARAM, POST, PUT, Sendable } from "./core.ts";
import { MethodSymbol } from "./lib/symbols.ts";

type ClientConfig = {
  baseUrl: string;
};

function collector(
  method: "GET" | "PUT" | "POST" | "DELETE",
  config: ClientConfig,
  accum: string[] = [],
): unknown {
  async function finalize(
    arg: Record<string, string> = {},
  ): Promise<[null, unknown] | [number, string]> {
    let route = accum.join("/");
    if (method === "GET" || method === "DELETE") {
      if (Object.keys(arg).length) {
        route += "?" + new URLSearchParams(arg);
      }
    }
    const path = new URL(route, config.baseUrl);
    const init: RequestInit = {};
    if (method === "POST" || method === "PUT") init.body = JSON.stringify(arg);
    const res = await fetch(path, init);
    if (res.ok) {
      return [null, await res.json()];
    } else {
      return [res.status, res.statusText];
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
  get: Route<typeof GET, Config>;
  put: Route<typeof PUT, Config>;
  post: Route<typeof POST, Config>;
  delete: Route<typeof DELETE, Config>;
};

type Route<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
> =
  & {
    [Key in keyof Config]: Key extends `$${string}` ? never
      : Key extends string ? Route<Method, Config[Key]>
      : never;
  }
  & (Method extends keyof Config ? Trigger<Method, Config>
    : {})
  & (HasParam<keyof Config> extends never ? {}
    : Record<
      string,
      Route<Method, Config[HasParam<keyof Config>]>
    >);

type Trigger<
  Method extends MethodSymbol,
  Config extends ClientsideAPI,
> = Config[Method] extends (...args: any[]) => any
  ? Parameters<Config[Method]> extends [infer Ctx]
    ? Method extends typeof GET | typeof DELETE
      ? Ctx extends { query: infer Query } ? (
          query: Query,
        ) => Promise<
          | readonly [null, Await<ReturnType<Config[Method]>>]
          | readonly [number, string]
        >
      : never
    : Ctx extends { getBody: () => Promise<infer Body> } ? (
        query: Body,
      ) => Promise<
        | readonly [null, Await<ReturnType<Config[Method]>>]
        | readonly [number, string]
      >
    : never
  : never
  : never;

type HasParam<Z extends {}> = keyof {
  [Key in Z as Key extends `$${string}` ? Key : never]: Key;
};

type Await<T> = T extends Promise<infer U> ? U : T;
