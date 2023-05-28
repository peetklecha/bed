import {
  ALIAS,
  DELETE,
  ERROR,
  FALLBACK,
  GET,
  METHOD_SYMBOLS,
  MethodSymbol,
  PARAM,
  PARENT,
  POST,
  PUT,
  USE,
} from "./symbols.ts";
import type { Context, ErrorContext } from "./context.ts";

export interface Config<
  UserDefinedContext extends Context,
> {
  [key: string]: Config<UserDefinedContext>;
  [PARAM]?: ParamConfig<UserDefinedContext>;
  [USE]?: Handler<UserDefinedContext>[];
  [GET]?: Handler<UserDefinedContext>;
  [PUT]?: Handler<UserDefinedContext>;
  [POST]?: Handler<UserDefinedContext>;
  [DELETE]?: Handler<UserDefinedContext>;
  [FALLBACK]?: Handler<UserDefinedContext>;
  [ERROR]?: ErrorHandler;
}

export interface AnnotatedConfig<UserDefinedContext extends Context>
  extends Config<UserDefinedContext> {
  [key: string]: AnnotatedConfig<UserDefinedContext>;
  [PARENT]: AnnotatedConfig<UserDefinedContext> | null;
  [ALIAS]?: string;
}

export interface ConfigWithParam<UserDefinedContext extends Context>
  extends Config<UserDefinedContext> {
  [PARAM]: ParamConfig<UserDefinedContext>;
}

export interface AnnotatedConfigWithParam<UserDefinedContext extends Context>
  extends AnnotatedConfig<UserDefinedContext> {
  [PARAM]: AnnotatedParamConfig<UserDefinedContext>;
}

export type _AnnotatedParamConfig<UDC extends Context, T extends string> = {
  [ALIAS]: T;
} & AnnotatedConfig<UDC & { params: { [Key in T]: string } }>;

export interface AnnotatedParamConfig<UserDefinedContext extends Context>
  extends AnnotatedConfig<UserDefinedContext> {
  [ALIAS]: string;
}

export interface ParamConfig<UserDefinedContext extends Context>
  extends Config<UserDefinedContext> {
  [ALIAS]: string;
}

export interface ConfigWithFallback<UserDefinedContext extends Context>
  extends AnnotatedConfig<UserDefinedContext> {
  [FALLBACK]: Handler<UserDefinedContext>;
}

export type HandlerReturnValue =
  | Promise<Sendable>
  | Sendable
  | void
  | Promise<void>;

export type Handler<
  UserDefinedContext extends Context, //<Query, Body>,
> // Query extends {} = Record<string, unknown>,
 = // Body extends {} = Record<string, unknown>,
  (
    ctx: UserDefinedContext,
  ) => HandlerReturnValue;

type ErrorHandler = (errCtx: ErrorContext) => HandlerReturnValue;

export type Prehandler = (
  event: Deno.RequestEvent,
) => Promise<boolean>;

export type Sendable =
  | BodyInit
  | null
  | unknown[]
  | Record<string | number | symbol, unknown>;
export type Recievable = string | boolean | null | number | Recievable[] | {
  [key: string]: Recievable;
};

export function isParamConfig<UserDefinedContext extends Context>(
  config: Config<UserDefinedContext>,
): config is ParamConfig<UserDefinedContext> {
  return ALIAS in config;
}

export function isMethodSymbol(
  node: string | MethodSymbol,
): node is MethodSymbol {
  return typeof node === "symbol" && METHOD_SYMBOLS.includes(node);
}

export function hasParam<UserDefinedContext extends Context>(
  endpoint: AnnotatedConfig<UserDefinedContext>,
): endpoint is AnnotatedConfigWithParam<UserDefinedContext> {
  return PARAM in endpoint;
}

export function hasFallback<UserDefinedContext extends Context>(
  endpoint: AnnotatedConfig<UserDefinedContext>,
): endpoint is ConfigWithFallback<UserDefinedContext> {
  return FALLBACK in endpoint;
}

export type SupportedMethodString = "GET" | "PUT" | "POST" | "DELETE";

export function asAPI<
  UserDefinedContext extends Context,
>(cfg: Config<UserDefinedContext>): typeof cfg {
  return cfg;
}

export type WithQuery<UserContext extends Context, Query extends {}> =
  & Omit<UserContext, "query">
  & {
    query: Query;
  };

export type WithBody<UserContext extends Context, Body extends {}> =
  & Omit<UserContext, "getBody">
  & {
    getBody: () => Promise<Body>;
  };
