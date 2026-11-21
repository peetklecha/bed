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
  AnnotatedParamConfig,
  Config,
  Handler,
  hasParam,
  isParamConfig,
  Sendable,
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

  fetch = async (req: Request) => {
    console.log(req);
    return await new Context(req).init(this)
      .next();
  };

  *traverseEndpoint(
    method: MethodSymbol,
    params: Record<string, string>,
    ...path: string[]
  ) {
    let endpoint = this.config;
    yield* endpoint[USE] ?? [];
    let miss = false;
    for (const node of path) {
      if (node in endpoint) {
        endpoint = endpoint[node];
        yield* endpoint[USE] ?? [];
      } else if (hasParam(endpoint)) {
        const paramEndpoint = endpoint[PARAM];
        params[paramEndpoint[ALIAS]] = node;
        endpoint = paramEndpoint;
        yield* endpoint[USE] ?? [];
      } else {
        miss = true;
      }
    }
    if (!miss && endpoint[method]) {
      yield endpoint[method];
    } else {
      let fallback = endpoint[FALLBACK];
      while (!fallback) {
        endpoint = endpoint[PARENT]!;
        fallback = endpoint[FALLBACK];
      }
      yield fallback;
    }
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
export type { Config, Handler, Sendable };
export { Context } from "./lib/context.ts";
export type { WithBody, WithQuery } from "./lib/types.ts";
export { PublicError } from "./error.ts";

export function hasStringParam<UserDefinedContext extends c.Context>(
  endpoint: AnnotatedConfig<UserDefinedContext>,
): string | undefined {
  return Object.keys(endpoint).find((key) => key.startsWith("$"));
}
