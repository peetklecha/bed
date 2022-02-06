export const FALLBACK = Symbol("FALLBACK");
export const PARAM = Symbol("PARAM");
export const ALIAS = Symbol("ALIAS");
export const PARENT = Symbol("PARENT");
export const GET = Symbol("GET");
export const POST = Symbol("POST");
export const PUT = Symbol("PUT");
export const DELETE = Symbol("DELETE");
export const ERROR = Symbol("ERROR");
export const USE = Symbol("USE");

export const MALFORMED_BODY = Symbol("MALFORMED_BODY");

export type MethodSymbol =
  | typeof GET
  | typeof PUT
  | typeof POST
  | typeof DELETE;
export const METHOD_SYMBOLS = [GET, PUT, POST, DELETE] as const;
