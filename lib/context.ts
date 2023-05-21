import {
  Cookie,
  getCookies,
  setCookie,
} from "https://deno.land/std@0.125.0/http/cookie.ts";
import type { Server } from "../core.ts";
import type {
  AnnotatedConfig,
  Handler,
  SupportedMethodString,
} from "./types.ts";

import {
  DELETE,
  ERROR,
  GET,
  MALFORMED_BODY,
  MethodSymbol,
  PARENT,
  POST,
  PUT,
} from "./symbols.ts";
import { assignHeaders, isBodyInit, PublicError } from "./util.ts";

const decoder = new TextDecoder();

export class Context {
  static symbols: Record<SupportedMethodString, MethodSymbol> = {
    GET,
    PUT,
    POST,
    DELETE,
  };

  #handlersIterator: IterableIterator<Handler<Context>> = [][Symbol.iterator]();
  #bodyPromise: Promise<ReturnType<JSON["parse"]>> = Promise.resolve();
  #endpoint: AnnotatedConfig<Context> = { [PARENT]: null };

  #responseBody: unknown = null;
  #responseStatus = 200;
  #responseHeaders = new Headers();
  #responseSent = false;

  #cookies: Record<string, string> | null = null;
  get cookies() {
    if (!this.#cookies) {
      this.#cookies = getCookies(this.requestEvent.request.headers);
    }
    return this.#cookies;
  }

  query: Record<string, unknown> = {};
  params: Record<string, string> = {};
  err: Error | null = null;

  constructor(public requestEvent: Deno.RequestEvent) {}
  init<UserDefinedContext extends Context>(server: Server<UserDefinedContext>) {
    const { path, queryString } = this.processedUrl;
    const { endpoint, params, handlers } = server.traverseEndpoint(
      ...path,
      this.#methodSymbol,
    );

    this.#handlersIterator = handlers[Symbol.iterator]() as IterableIterator<
      Handler<Context>
    >;
    this.#bodyPromise = server.jsonBody ? this.#getBody() : Promise.resolve();
    this.#endpoint = endpoint as AnnotatedConfig<Context>;

    this.query = Object.fromEntries(new URLSearchParams(queryString));
    this.params = params;
    return this;
  }

  getBody = async () => {
    const body = (await this.#bodyPromise) || {};
    if (MALFORMED_BODY in body) {
      throw new Error("There was an error parsing the request body as JSON.");
    }
    return body;
  };

  next = async (err?: Error) => {
    try {
      if (err) throw err;
      const { value: handler, done } = this.#handlersIterator.next();
      if (!done) {
        const value = await handler(this);
        if (value !== undefined) {
          if (this.#responseBody) throw new Error("Response already sent.");
          this.#responseBody = value;
          await this.#res();
        }
      } else throw new Error("Can't call next -- no more handlers!");
    } catch (err) {
      await this.#handleError(err);
    }
  };

  get processedUrl() {
    const { requestEvent: { request: { url } } } = this;
    const tld = url.slice(url.indexOf("://") + 3);
    const fullPathString = tld.slice(tld.indexOf("/"));
    const [pathString, queryString = ""] = fullPathString.split("?");
    const path = pathString.split("/").filter((x) => !!x);
    return { path, queryString, pathString, fullPathString };
  }

  get #methodSymbol() {
    const { requestEvent: { request } } = this;
    const method = request.method.toUpperCase();
    if (!Context.methodIsSupported(method)) {
      throw new Error(`Method ${request.method} is not supported.`);
    }
    return Context.symbols[method];
  }

  getHeaders() {
    return this.#responseHeaders;
  }

  setHeaders(headers: HeadersInit) {
    this.#responseHeaders = new Headers(headers);
  }

  assignHeaders = (...headers: HeadersInit[]) => {
    assignHeaders(this.#responseHeaders, ...headers);
  };

  getStatus() {
    return this.#responseStatus;
  }

  setStatus(status: number) {
    this.#responseStatus = status;
  }

  setCookie(cookie: Cookie) {
    setCookie(this.#responseHeaders, cookie);
  }

  #res = async () => {
    if (this.#responseSent) throw new Error("Response already sent.");
    const unserializedBody = this.#responseBody;
    const status = this.#responseStatus;
    const headers = this.#responseHeaders;

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
    this.#responseSent = true;
    await this.requestEvent.respondWith(
      new Response(body, { status, headers }),
    );
  };

  redirect = (url: string) => {
    this.setHeaders({ location: url });
    this.setStatus(302);
    return "";
    // const headers = new Headers(responseParams?.headers);
    // headers.set("location", url);
    // const response = new Response(null, {
    //   status: 302,
    //   ...responseParams,
    //   headers,
    // });
    // return this.requestEvent.respondWith(response);
  };

  async #getBody() {
    try {
      const buffer = await this.requestEvent.request.arrayBuffer();
      const array = new Uint8Array(buffer);
      const string = decoder.decode(array);
      return JSON.parse(string);
    } catch (err) {
      return { [MALFORMED_BODY]: err };
    }
  }

  async #handleError(err: Error): Promise<void> {
    if (err instanceof PublicError) {
      this.#responseStatus = err.statusCode;
      this.#responseBody = err.message;
      return await this.#res();
    }
    try {
      // use nearest user-defined error handler, if one exists
      this.err = err;
      let endpoint: AnnotatedConfig<this> | null = this.#endpoint;
      while (endpoint && !(ERROR in endpoint)) {
        endpoint = endpoint[PARENT];
      }
      if (endpoint && ERROR in endpoint) {
        this.#responseBody = await endpoint[ERROR]!(this as ErrorContext);
        return await this.#res();
      }
    } catch (err) {
      // log any errors that occur within user-defined error handlers
      console.error(
        "Bed Error: An error occurred inside a user-defined error-handler.",
      );
      console.error(err);
    }
    // otherwise just send 500
    this.#responseStatus = 500;
    await this.#res().catch(console.error);
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
