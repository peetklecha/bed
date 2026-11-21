/** Key for a router's fallback handler, used when no endpoint below it matches. */
export const FALLBACK = Symbol("FALLBACK");
/** Key for a router's parametric child route (e.g. `/users/:id`). */
export const PARAM = Symbol("PARAM");
/** Key naming a parametric route's parameter, as it appears in `ctx.params`. */
export const ALIAS = Symbol("ALIAS");
/** Internal: link from an annotated route to its parent route. */
export const PARENT = Symbol("PARENT");
/** Key for a route's `GET` handler. */
export const GET = Symbol("GET");
/** Key for a route's `POST` handler. */
export const POST = Symbol("POST");
/** Key for a route's `PUT` handler. */
export const PUT = Symbol("PUT");
/** Key for a route's `DELETE` handler. */
export const DELETE = Symbol("DELETE");
/** Key for a router's error handler, used for errors thrown at or below it. */
export const ERROR = Symbol("ERROR");
/** Key for a router's middleware array, run for every request at or below it. */
export const USE = Symbol("USE");

/** Internal: marks a request body that failed to parse as JSON. */
export const MALFORMED_BODY = Symbol("MALFORMED_BODY");

/** The symbol keys for the supported HTTP methods. */
export type MethodSymbol =
  | typeof GET
  | typeof PUT
  | typeof POST
  | typeof DELETE;
/** All supported HTTP method symbols. */
export const METHOD_SYMBOLS = [GET, PUT, POST, DELETE] as const;
