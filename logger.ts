import {
  cyan,
  green,
  red,
  yellow,
} from "https://deno.land/std@0.115.1/fmt/colors.ts";
import type { Handler } from "./lib/types.ts";
import type { Context } from "./lib/context.ts";

const logging: Handler<Context> = async (ctx) => {
  const { next, processedUrl, requestEvent } = ctx;
  const start = performance.now();
  await next();
  const end = performance.now();
  const { method } = requestEvent.request;
  const { fullPathString } = processedUrl;
  const status = formattedStatus(ctx.extras.responseStatus);
  const time = `${+end - +start}ms`;
  console.log(`${method} ${fullPathString} ${status || ''} ${time}`);
};

const formattedStatus = (status: unknown) => {
  if (typeof status === "number" && !Deno.noColor) {
    if (status >= 500) return red(`${status}`);
    if (status >= 400) return yellow(`${status}`);
    if (status >= 300) return cyan(`${status}`);
    if (status >= 200) return green(`${status}`);
  }
  return `${status}`;
};

export default logging;
