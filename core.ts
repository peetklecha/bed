import {
  ALIAS,
  DELETE,
  ERROR,
  FALLBACK,
  GET,
  type MethodSymbol,
  PARAM,
  PARENT,
  POST,
  PUT,
  USE,
} from "./lib/symbols.ts";
import {
  type AnnotatedConfig,
  type AnnotatedParamConfig,
  type Config,
  type ErrorHandler,
  type Handler,
  type HandlerStep,
  hasParam,
  isParamConfig,
  type Sendable,
} from "./lib/types.ts";
import * as c from "./lib/context.ts";

const { Context } = c;

class Server<UserDefinedContext extends c.Context> {
  config: AnnotatedConfig<UserDefinedContext>;
  jsonBody: boolean;
  [key: string]: unknown;

  constructor(
    apiConfig: Config<UserDefinedContext>,
    {
      jsonBody = true,
    }: {
      jsonBody?: boolean;
    } = {},
  ) {
    this.jsonBody = jsonBody;
    this.config = Server.#annotateConfig(apiConfig);
  }

  /** Handle a web-standard Request. Works anywhere `fetch` handlers do. */
  fetch = (req: Request): Promise<Response> => {
    return new Context(req).init(this).next();
  };

  /**
   * Yields every handler that applies to a request -- middleware first, then
   * the endpoint (or the nearest fallback) -- each paired with the nearest
   * error handler in scope at that point in the tree.
   */
  *traverseEndpoint(
    method: MethodSymbol,
    params: Record<string, string>,
    ...path: string[]
  ): Generator<HandlerStep<UserDefinedContext>, void, unknown> {
    let endpoint = this.config;
    let err: ErrorHandler | undefined;
    let fallback = endpoint[FALLBACK]!;
    function* enter(node: AnnotatedConfig<UserDefinedContext>) {
      if (node[ERROR]) err = node[ERROR];
      if (node[FALLBACK]) fallback = node[FALLBACK];
      for (const handler of node[USE] ?? []) yield { handler, err };
    }
    yield* enter(endpoint);
    let miss = false;
    for (const node of path) {
      if (Object.hasOwn(endpoint, node)) {
        endpoint = endpoint[node];
      } else if (hasParam(endpoint)) {
        params[endpoint[PARAM][ALIAS]] = node;
        endpoint = endpoint[PARAM];
      } else {
        miss = true;
        break;
      }
      yield* enter(endpoint);
    }
    const handler = miss ? undefined : endpoint[method];
    yield { handler: handler ?? fallback, err };
  }

  static #annotateConfig<UserDefinedContext extends c.Context>(
    config: Config<UserDefinedContext>,
    parent: AnnotatedConfig<UserDefinedContext> | null = null,
  ) {
    const output: AnnotatedConfig<UserDefinedContext> = { [PARENT]: parent };
    let hasSeenParam = "";
    for (const key of Object.getOwnPropertyNames(config)) {
      if (key.startsWith("$")) {
        if (hasSeenParam) {
          throw new Error(
            `Cannot define multiple parametric handlers for the same route: ${hasSeenParam}, ${key}`,
          );
        }
        hasSeenParam = key;
        output[PARAM] = this.#annotateConfig(
          { ...config[key], [ALIAS]: key.slice(1) },
          output,
        ) as AnnotatedParamConfig<UserDefinedContext>;
      } else {
        output[key] = this.#annotateConfig(config[key], output);
      }
    }
    if (FALLBACK in config) output[FALLBACK] = config[FALLBACK];
    else if (parent === null) {
      const bedDefaultFallback = ({ setStatus }: c.Context) => {
        setStatus(404);
        return "Not found.";
      };
      output[FALLBACK] = bedDefaultFallback;
    }

    // typescript made me do it this way
    if (ERROR in config) output[ERROR] = config[ERROR];
    if (GET in config) output[GET] = config[GET];
    if (PUT in config) output[PUT] = config[PUT];
    if (POST in config) output[POST] = config[POST];
    if (DELETE in config) output[DELETE] = config[DELETE];
    if (USE in config) output[USE] = config[USE];
    if (PARAM in config) {
      if (!isParamConfig(config[PARAM]!)) {
        throw new Error("Parametric routes must have an alias");
      }
      output[PARAM] = this.#annotateConfig(
        config[PARAM]!,
        output,
      ) as AnnotatedParamConfig<UserDefinedContext>;
    }
    if (isParamConfig(config)) output[ALIAS] = config[ALIAS];

    return output;
  }
}

export { ALIAS, DELETE, ERROR, FALLBACK, GET, PARAM, POST, PUT, Server, USE };
export type { Config, ErrorHandler, Handler, Sendable };
export { Context } from "./lib/context.ts";
export type { ErrorContext } from "./lib/context.ts";
export type { Cookie } from "./lib/cookie.ts";
export type { WithBody, WithQuery } from "./lib/types.ts";
export { PublicError } from "./error.ts";

export function hasStringParam<UserDefinedContext extends c.Context>(
  endpoint: AnnotatedConfig<UserDefinedContext>,
): string | undefined {
  return Object.keys(endpoint).find((key) => key.startsWith("$"));
}
