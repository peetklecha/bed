import { type Cookie, getCookies, setCookie } from "./cookie.ts";
import type { Server } from "../core.ts";
import type {
  ErrorHandler,
  HandlerStep,
  SupportedMethodString,
} from "./types.ts";

import {
  DELETE,
  GET,
  MALFORMED_BODY,
  type MethodSymbol,
  POST,
  PUT,
} from "./symbols.ts";
import { assignHeaders, isBodyInit } from "./util.ts";
import { PublicError } from "../error.ts";

const decoder = new TextDecoder();

// Read lazily from process.env, which exists on Node, Deno, Bun, and on
// Cloudflare Workers with `nodejs_compat`.
const logHandlers = (): boolean =>
  !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.BED_LOG_HANDLERS;

export class Context {
  static symbols: Record<SupportedMethodString, MethodSymbol> = {
    GET,
    PUT,
    POST,
    DELETE,
  };

  #handlersIterator: Iterator<HandlerStep<Context>> = [][Symbol.iterator]();
  #bodyPromise?: Promise<undefined> = Promise.resolve(
    {} as unknown as undefined,
  );

  #responseStatus = 200;
  #responseHeaders = new Headers();

  #cookies: Record<string, string> | null = null;
  get cookies(): Record<string, string> {
    if (!this.#cookies) {
      this.#cookies = getCookies(this.request.headers);
    }
    return this.#cookies;
  }

  query: never = {} as never;
  params: Record<string, string> = {};
  err: Error | null = null;
  request: Request;

  constructor(request: Request) {
    this.request = request;
  }

  init<UserDefinedContext extends Context>(
    server: Server<UserDefinedContext>,
  ): this {
    const { path, queryString } = this.processedUrl;
    this.#handlersIterator = server.traverseEndpoint(
      this.#methodSymbol,
      this.params,
      ...path,
    ) as Iterator<HandlerStep<Context>>;

    this.#bodyPromise = server.jsonBody ? this.#getBody() : Promise.resolve();

    // @ts-expect-error query is actually Record<string, unknown> but needs `never` for obscure reasons
    this.query = Object.fromEntries(
      new URLSearchParams(queryString),
    );
    return this;
  }

  getBody: never = (async () => {
    const body = (await this.#bodyPromise) || {};
    if (typeof body === "object" && body && MALFORMED_BODY in body) {
      throw new Error("There was an error parsing the request body as JSON.");
    }
    return body;
  }) as never;

  #currentErrorHandler?: ErrorHandler;

  next = async (passedError?: Error): Promise<Response> => {
    if (passedError) {
      return await this.#handleError(passedError, this.#currentErrorHandler);
    }
    const step = this.#handlersIterator.next();
    const err = step.done ? this.#currentErrorHandler : step.value.err;
    this.#currentErrorHandler = err;
    try {
      if (step.done) throw new Error("Can't call next -- no more handlers!");
      if (logHandlers()) console.log(" ->", step.value.handler);
      return this.#res(await step.value.handler(this));
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return await this.#handleError(error, err);
    }
  };

  get processedUrl(): {
    path: string[];
    queryString: string;
    pathString: string;
    fullPathString: string;
  } {
    const { request: { url } } = this;
    const tld = url.slice(url.indexOf("://") + 3);
    const fullPathString = tld.slice(tld.indexOf("/"));
    const [pathString, queryString = ""] = fullPathString.split("?");
    const path = pathString.split("/").filter((x) => !!x);
    return { path, queryString, pathString, fullPathString };
  }

  get url(): URL {
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

  getHeaders = (): Headers => {
    return this.#responseHeaders;
  };

  setHeaders = (headers: HeadersInit): void => {
    this.#responseHeaders = new Headers(headers);
  };

  assignHeaders = (...headers: HeadersInit[]): void => {
    this.#responseHeaders = assignHeaders(this.#responseHeaders, ...headers);
  };

  getStatus = (): number => {
    return this.#responseStatus;
  };

  setStatus = (status: number): void => {
    this.#responseStatus = status;
  };

  setCookie = (cookie: Cookie): void => {
    setCookie(this.#responseHeaders, cookie);
  };

  #bodyHooks: ((body: unknown) => unknown)[] = [];
  setBodyHook = (cb: (body: unknown) => unknown): void => {
    this.#bodyHooks.push(cb);
  };

  #res = (unserializedBody: unknown): Response => {
    if (unserializedBody instanceof Response) return unserializedBody;
    const status = this.#responseStatus;
    const headers = this.#responseHeaders;

    for (const cb of this.#bodyHooks) {
      unserializedBody = cb(unserializedBody);
    }

    let body: BodyInit | null;
    if (unserializedBody === null || unserializedBody === undefined) {
      body = null;
    } else if (isBodyInit(unserializedBody)) {
      body = unserializedBody;
    } else {
      body = JSON.stringify(unserializedBody);
      if (!headers.get("Content-Type")) {
        headers.append("Content-Type", "application/json");
      }
    }
    return new Response(body, { status, headers });
  };

  redirect = (url: string): string => {
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

  async #handleError(err: Error, handler?: ErrorHandler): Promise<Response> {
    if (err instanceof PublicError) {
      this.#responseStatus = err.statusCode;
      return this.#res(err.message);
    }
    try {
      // use nearest user-defined error handler, if one exists
      this.err = err;
      if (handler) {
        return this.#res(await handler(this as ErrorContext));
      }
    } catch (err) {
      if (err instanceof PublicError) {
        this.#responseStatus = err.statusCode;
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
