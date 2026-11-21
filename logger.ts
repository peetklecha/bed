import type { Handler } from "./lib/types.ts";
import type { Context } from "./lib/context.ts";

const logging: Handler<Context> = async (ctx) => {
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
