/**
 * Request-logging middleware.
 *
 * @example
 * ```ts
 * import { Server, USE } from "@peetklecha/bed";
 * import logging from "@peetklecha/bed/logging";
 *
 * new Server({ [USE]: [logging], ...routes }); // logs "GET /users 200 1.23ms"
 * ```
 *
 * @module
 */
import type { Context } from "./lib/context.ts";

/** Middleware that logs each request's method, path, status, and duration. */
const logging = async (ctx: Context): Promise<Response> => {
  const { next, processedUrl, request } = ctx;
  const start = performance.now();
  const res = await next();
  const end = performance.now();
  const { method } = request;
  const { fullPathString } = processedUrl;
  const time = `${(+end - +start).toFixed(2)}ms`;
  console.log(`${method} ${fullPathString} ${res.status} ${time}`);
  return res;
};

export default logging;
