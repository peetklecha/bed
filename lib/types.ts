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

export interface Config<UserDefinedContext extends Context> {
  [key: string]: Config<UserDefinedContext>;
  [PARAM]?: ParamConfig<UserDefinedContext>;
  [USE]?: Handler<UserDefinedContext>[];
  [GET]?: HandlerSpec<UserDefinedContext>;
  [PUT]?: HandlerSpec<UserDefinedContext>;
  [POST]?: HandlerSpec<UserDefinedContext>;
  [DELETE]?: HandlerSpec<UserDefinedContext>;
  [FALLBACK]?: HandlerSpec<UserDefinedContext>;
  [ERROR]?: ErrorHandler;
}

export interface AnnotatedConfig<UserDefinedContext extends Context> extends Config<UserDefinedContext> {
  [key: string]: AnnotatedConfig<UserDefinedContext>;
  [PARENT]: AnnotatedConfig<UserDefinedContext> | null;
  [ALIAS]?: string;
}

export interface ConfigWithParam<UserDefinedContext extends Context> extends Config<UserDefinedContext> {
  [PARAM]: ParamConfig<UserDefinedContext>;
}

export interface AnnotatedConfigWithParam<UserDefinedContext extends Context> extends AnnotatedConfig<UserDefinedContext> {
  [PARAM]: AnnotatedParamConfig<UserDefinedContext>;
}

export interface AnnotatedParamConfig<UserDefinedContext extends Context> extends AnnotatedConfig<UserDefinedContext> {
  [ALIAS]: string;
}

export interface ParamConfig<UserDefinedContext extends Context> extends Config<UserDefinedContext> {
  [ALIAS]: string;
}

export interface ConfigWithFallback<UserDefinedContext extends Context> extends AnnotatedConfig<UserDefinedContext> {
  [FALLBACK]: HandlerSpec<UserDefinedContext>;
}

export type Handler<UserDefinedContext extends Context> = (ctx: UserDefinedContext) => void | Promise<void>;
type ErrorHandler = (errCtx: ErrorContext) => void | Promise<void>;
export type HandlerSpec<UserDefinedContext extends Context> = Handler<UserDefinedContext> | Handler<UserDefinedContext>[];

export type Prehandler = ((
  event: Deno.RequestEvent,
) => Promise<boolean>);

export type Sendable = string | boolean | null | (Sendable | number)[] | {
  [key: string]: (Sendable | number);
};
export type Recievable = string | boolean | null | number | Recievable[] | {
  [key: string]: Recievable;
};

export function isParamConfig<UserDefinedContext extends Context>(config: Config<UserDefinedContext>): config is ParamConfig<UserDefinedContext> {
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
