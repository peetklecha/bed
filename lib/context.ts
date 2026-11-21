import { env } from "cloudflare:workers";
import { type Cookie, getCookies, setCookie } from "./cookie.ts";
import type { Server } from "../core.ts";
import type {
  AnnotatedConfig,
  Handler,
  SupportedMethodString,
} from "./types.ts";

import {
  DELETE,
  ENDPOINT_RESPONSE,
  ERROR,
  GET,
  MALFORMED_BODY,
  MethodSymbol,
  PARENT,
  POST,
  PUT,
} from "./symbols.ts";
import { assignHeaders, isBodyInit } from "./util.ts";
import { PublicError } from "../error.ts";

const decoder = new TextDecoder();

type PreResponse =
  & { body: BodyInit | null; [ENDPOINT_RESPONSE]: true }
  & ResponseInit;

const BED_LOG_HANDLERS = (env as { BED_LOG_HANDLERS?: string })
  .BED_LOG_HANDLERS;
console.log({ BED_LOG_HANDLERS });

export class Context {
  static symbols: Record<SupportedMethodString, MethodSymbol> = {
    GET,
    PUT,
    POST,
    DELETE,
  };

  #handlersIterator: IterableIterator<Handler<Context>> = [][Symbol.iterator]();
  #bodyPromise?: Promise<undefined> = Promise.resolve(
    {} as unknown as undefined,
  );
  #endpoint: AnnotatedConfig<Context> = { [PARENT]: null };

  // #responseBody: unknown = null;
  #responseStatus = 200;
  #responseHeaders = new Headers();
  // #responseSent = false;

  #cookies: Record<string, string> | null = null;
  get cookies() {
    if (!this.#cookies) {
      this.#cookies = getCookies(this.request.headers);
    }
    return this.#cookies;
  }

  //query?: undefined = {} as unknown as undefined;
  query: never = {} as never;
  params: Record<string, string> = {};
  err: Error | null = null;
  request: Request;

  constructor(request: Request) {
    this.request = request;
  }
  init<UserDefinedContext extends Context>(server: Server<UserDefinedContext>) {
    console.log({ BED_LOG_HANDLERS });
    const { path, queryString } = this.processedUrl;
    this.#handlersIterator = server.traverseEndpoint(
      this.#methodSymbol,
      this.params,
      ...path,
    ) as IterableIterator<Handler<Context>>;

    // this.#handlersIterator = handlers[Symbol.iterator]() as IterableIterator<
    //   Handler<Context>
    // >;
    this.#bodyPromise = server.jsonBody ? this.#getBody() : Promise.resolve();
    // this.#endpoint = endpoint as AnnotatedConfig<Context>;

    // @ts-expect-error query is actually Record<string, unknown> but needs `never` for obscure reasons
    this.query = Object.fromEntries(
      new URLSearchParams(queryString),
    );
    // this.params = params;
    return this;
  }

  getBody: never = (async () => {
    const body = (await this.#bodyPromise) || {};
    if (typeof body === "object" && body && MALFORMED_BODY in body) {
      throw new Error("There was an error parsing the request body as JSON.");
    }
    return body;
  }) as never;

  next = async (err?: Error) => {
    try {
      if (err) throw err;
      const { value: handler, done } = this.#handlersIterator.next();
      if (BED_LOG_HANDLERS) {
        console.log(" ->", handler);
      }
      if (!done) {
        return this.#res(await handler(this));
        // if (value !== undefined) {
        //   // if (this.#responseBody) throw new Error("Response already sent.");
        //   // this.#responseBody = value;
        //   return this.#res(value);
        // }
      } else throw new Error("Can't call next -- no more handlers!");
    } catch (err) {
      if (err instanceof Error) {
        return await this.#handleError(err);
      } else {
        return await this.#handleError(new Error(String(err)));
      }
    }
  };

  get processedUrl() {
    const { request: { url } } = this;
    const tld = url.slice(url.indexOf("://") + 3);
    const fullPathString = tld.slice(tld.indexOf("/"));
    const [pathString, queryString = ""] = fullPathString.split("?");
    const path = pathString.split("/").filter((x) => !!x);
    return { path, queryString, pathString, fullPathString };
  }

  get url() {
    return new URL(this.request.url);
  }

  get #methodSymbol() {
    const { request } = this;
    const method = request.method.toUpperCase();
    if (!Context.methodIsSupported(method)) {
      throw new Error(`Method ${request.method} is not supported.`);
    }
    return Context.symbols[method];
  }

  getHeaders = () => {
    return this.#responseHeaders;
  };

  setHeaders = (headers: HeadersInit) => {
    this.#responseHeaders = new Headers(headers);
  };

  assignHeaders = (...headers: HeadersInit[]) => {
    this.#responseHeaders = assignHeaders(this.#responseHeaders, ...headers);
  };

  getStatus = () => {
    return this.#responseStatus;
  };

  setStatus = (status: number) => {
    this.#responseStatus = status;
  };

  setCookie = (cookie: Cookie) => {
    setCookie(this.#responseHeaders, cookie);
  };

  #bodyHooks: ((body: unknown) => unknown)[] = [];
  setBodyHook = (cb: (body: unknown) => unknown) => {
    this.#bodyHooks.push(cb);
  };

  #res = (unserializedBody: unknown): Response => {
    if (
      unserializedBody instanceof Response
      // typeof unserializedBody === "object" && unserializedBody &&
      // ENDPOINT_RESPONSE in unserializedBody
    ) {
      return unserializedBody;
    }
    // if (this.#responseSent) throw new Error("Response already sent.");
    // const unserializedBody = this.#responseBody;
    const status = this.#responseStatus;
    const headers = this.#responseHeaders;

    let midbody = unserializedBody;
    for (const cb of this.#bodyHooks) {
      midbody = cb(midbody);
    }

    let body: BodyInit | null;
    if (unserializedBody === null) {
      body = unserializedBody;
    } else if (isBodyInit(unserializedBody)) {
      body = unserializedBody;
    } else {
      body = JSON.stringify(unserializedBody);
      if (!headers.get("Content-Type")) {
        headers.append("Content-Type", "application/json");
      }
    }
    // this.#responseSent = true;
    return new Response(body, { status, headers });
    // return { body, status, headers, [ENDPOINT_RESPONSE]: true };
  };

  redirect = (url: string) => {
    this.assignHeaders({ location: url });
    this.setStatus(302);
    return "";
  };

  async #getBody() {
    try {
      const buffer = await this.request.arrayBuffer();
      const array = new Uint8Array(buffer);
      const string = decoder.decode(array);
      return JSON.parse(string);
    } catch (err) {
      return { [MALFORMED_BODY]: err };
    }
  }

  async #handleError(err: Error): Promise<Response> {
    if (err instanceof PublicError) {
      this.#responseStatus = err.statusCode;
      // this.#responseBody = err.message;
      return this.#res(err.message);
    }
    try {
      // use nearest user-defined error handler, if one exists
      this.err = err;
      let endpoint: AnnotatedConfig<this> | null = this.#endpoint;
      while (endpoint && !(ERROR in endpoint)) {
        endpoint = endpoint[PARENT];
      }
      if (endpoint && ERROR in endpoint) {
        // this.#responseBody = ;
        return this.#res(await endpoint[ERROR]!(this as ErrorContext));
      }
    } catch (err) {
      if (err instanceof PublicError) {
        this.#responseStatus = err.statusCode;
        // this.#responseBody = err.message;
        return this.#res(err.message);
      }
      // log any errors that occur within user-defined error handlers
      console.error(
        "Bed Error: An error occurred inside a user-defined error-handler.",
      );
      console.error(err);
    }
    // otherwise just send 500
    this.#responseStatus = 500;
    return this.#res("error");
  }

  static methodIsSupported(
    method: string,
  ): method is "GET" | "PUT" | "POST" | "DELETE" {
    return method in this.symbols;
  }
}

export interface ErrorContext extends Context {
  err: Error;
}
