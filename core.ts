import {
  ALIAS,
  DELETE,
  ERROR,
  FALLBACK,
  GET,
  MethodSymbol,
  PARAM,
  PARENT,
  POST,
  PUT,
  USE,
} from "./lib/symbols.ts";
import {
  AnnotatedConfig,
  Config,
  Handler,
  hasParam,
  isMethodSymbol,
  isParamConfig,
  Prehandler,
  Sendable,
} from "./lib/types.ts";
import { Context } from "./lib/context.ts";
import { loadMiddleware, PublicError, push } from "./lib/util.ts";

class Server<UserDefinedContext extends Context> {
  config: AnnotatedConfig<UserDefinedContext>;
  server: Deno.Listener | null = null;
  prehandlers: Prehandler<UserDefinedContext>[];
  jsonBody: boolean;
  [key: string]: unknown

  constructor(
    apiConfig: Config<UserDefinedContext>,
    { prehandlers = [], jsonBody = true }: {
      prehandlers?: Prehandler<UserDefinedContext>[];
      jsonBody?: boolean;
    } = {},
  ) {
    this.prehandlers = prehandlers;
    this.jsonBody = jsonBody;
    this.config = Server.#annotateConfig(apiConfig);
  }

  async listen(port: number) {
    this.server = Deno.listen({ port });
    for await (const conn of this.server) {
      this.#handle(conn).catch(console.error);
    }
  }

  async #handle(conn: Deno.Conn) {
    const httpConn = Deno.serveHttp(conn);
    for await (const event of httpConn) {
      if (await this.#preprocess(event)) continue;
      await new Context(event, this as unknown as Server<Context>).next();
    }
  }

  traverseEndpoint(...path: (string | MethodSymbol)[]) {
    let endpoint = this.config;
    const params: Record<string, string> = {};
    const handlers: Handler<UserDefinedContext>[] = [];
    let endpointSet = false;
    for (const node of path) {
      if (node in endpoint) {
        if (isMethodSymbol(node)) {
          push(handlers, endpoint[node]);
          endpointSet = true;
        } else endpoint = endpoint[node];
      } else if (typeof node === "string" && hasParam(endpoint)) {
        const paramEndpoint = endpoint[PARAM];
        params[paramEndpoint[ALIAS]] = node;
        endpoint = paramEndpoint;
      } else break;
    }
    loadMiddleware(endpoint, endpointSet, handlers);
    return { endpoint, params, handlers };
  }

  static #annotateConfig<UserDefinedContext extends Context>(
    config: Config<UserDefinedContext>,
    parent: AnnotatedConfig<UserDefinedContext> | null = null,
  ) {
    const output: AnnotatedConfig<UserDefinedContext> = { [PARENT]: parent };
    for (const key of Object.getOwnPropertyNames(config)) {
      output[key] = this.#annotateConfig(config[key], output);
    }
    if (FALLBACK in config) output[FALLBACK] = config[FALLBACK];
    else if (parent === null) {
      output[FALLBACK] = async ({ res }) => await res(404);
    }
		// typescript made me do it this way
    if (ERROR in config) output[ERROR] = config[ERROR];
    if (GET in config) output[GET] = config[GET];
    if (PUT in config) output[PUT] = config[PUT];
    if (POST in config) output[POST] = config[POST];
    if (DELETE in config) output[DELETE] = config[DELETE];
    if (USE in config) output[USE] = config[USE];
    if (PARAM in config) {
      output[PARAM] = config[PARAM];
      if (!isParamConfig(config)) {
        throw new Error("Parametric routes must have an alias");
      }
    }
    if (isParamConfig(config)) output[ALIAS] = config[ALIAS];
    return output;
  }

  async #preprocess(event: Deno.RequestEvent) {
    for (const prehandler of this.prehandlers) {
      const done = await prehandler(this, event);
      if (done) return true;
    }
    return false;
  }
}

export {
  ALIAS,
  DELETE,
  ERROR,
  FALLBACK,
  GET,
  PARAM,
  POST,
  PublicError,
  PUT,
  Server,
  USE,
};
export type { Config, Context, Handler, Prehandler, Sendable };
