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
import type { Server } from "../core.ts";

export interface Config {
  [key: string]: Config;
  [PARAM]?: ParamConfig;
  [USE]?: Handler[];
  [GET]?: HandlerSpec;
  [PUT]?: HandlerSpec;
  [POST]?: HandlerSpec;
  [DELETE]?: HandlerSpec;
  [FALLBACK]?: HandlerSpec;
  [ERROR]?: ErrorHandler;
}

export interface AnnotatedConfig extends Config {
  [key: string]: AnnotatedConfig;
  [PARENT]: AnnotatedConfig | null;
  [ALIAS]?: string;
}

export interface AnnotatedConfigWithParam extends AnnotatedConfig {
  [PARAM]: ParamConfig;
}

export interface ParamConfig extends AnnotatedConfig {
  [ALIAS]: string;
}

export interface ConfigWithFallback extends AnnotatedConfig {
  [FALLBACK]: HandlerSpec;
}

export type Handler = (ctx: Context) => void | Promise<void>;
type ErrorHandler = (errCtx: ErrorContext) => void | Promise<void>;
export type HandlerSpec = Handler | Handler[];

export type Prehandler = ((
  server: Server,
  event: Deno.RequestEvent,
) => Promise<boolean>);

export type Sendable = string | boolean | null | (Sendable | number)[] | {
  [key: string]: (Sendable | number);
};
export type Recievable = string | boolean | null | number | Recievable[] | {
  [key: string]: Recievable;
};

export function isParamConfig(config: Config): config is ParamConfig {
  return ALIAS in config;
}

export function isMethodSymbol(
  node: string | MethodSymbol,
): node is MethodSymbol {
  return typeof node === "symbol" && METHOD_SYMBOLS.includes(node);
}

export function hasParam(
  endpoint: AnnotatedConfig,
): endpoint is AnnotatedConfigWithParam {
  return PARAM in endpoint;
}

export function hasFallback(
  endpoint: AnnotatedConfig,
): endpoint is ConfigWithFallback {
  return FALLBACK in endpoint;
}

export type SupportedMethodString = "GET" | "PUT" | "POST" | "DELETE";
