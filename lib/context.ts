import type { Server } from "../core.ts";
import type {
  AnnotatedConfig,
  Handler,
  Sendable,
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
import { PublicError } from "./util.ts";

const decoder = new TextDecoder();

export class Context {
  static symbols: Record<SupportedMethodString, MethodSymbol> = {
    GET,
    PUT,
    POST,
    DELETE,
  };

  #handlersIterator: IterableIterator<Handler<this>>;
  #bodyPromise: Promise<ReturnType<JSON["parse"]>>;
  #endpoint: AnnotatedConfig<this>;

  query: Record<string, unknown>;
  params: Record<string, string>;
  err: Error | null = null;
  extras: Record<string, unknown> = {};

  constructor(public requestEvent: Deno.RequestEvent, server: Server<Context>) {
    const { path, queryString } = this.processedUrl;
    const { endpoint, params, handlers } = server.traverseEndpoint(
      ...path,
      this.#methodSymbol,
    );

    this.#handlersIterator = handlers[Symbol.iterator]();
    this.#bodyPromise = server.jsonBody ? this.#getBody() : Promise.resolve();
    this.#endpoint = endpoint;

    this.query = Object.fromEntries(new URLSearchParams(queryString));
    this.params = params;
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
      if (!done) return await handler(this);
      else throw new Error("Can't call next -- no more handlers!");
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

  res = async (first?: number | Sendable, second?: Sendable) => {
    const status = typeof first === "number"
      ? first
      : first === undefined
      ? 204
      : 200;
    const body =
      typeof first === "number" && second === undefined || first === undefined
        ? null
        : JSON.stringify(second === undefined ? first : second);
    await this.requestEvent.respondWith(new Response(body, { status }));
    this.extras.responseStatus = status;
    this.extras.responseBody = body;
  };

	redirect = (url: string) => {
		return this.requestEvent.respondWith(Response.redirect(url, 302))
	}

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
      return await this.res(err.statusCode, err.message);
    }
    try {
      // use nearest user-defined error handler, if one exists
      this.err = err;
      let endpoint: AnnotatedConfig<this> | null = this.#endpoint;
      while (endpoint && !(ERROR in endpoint)) endpoint = endpoint[PARENT];
      if (endpoint && ERROR in endpoint) {
        return endpoint[ERROR]!(this as ErrorContext);
      }
    } catch (err) {
      // log any errors that occur within user-defined error handlers
      console.error(
        "Bed Error: An error occurred inside a user-defined error-handler.",
      );
      console.error(err);
    }
    // otherwise just send 500
    await this.res(500).catch(console.error);
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
