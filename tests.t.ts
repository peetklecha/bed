import { ALIAS, FALLBACK, GET, PARAM, Server } from "./core.ts";
import { Context } from "./lib/context.ts";

let calls: Context[] = [];
let fallbacks: Context[] = [];

const srvr = new Server({
  one: {
    two: {
      [PARAM]: {
        [ALIAS]: "param",
        three: {
          [GET]: (ctx) => {
            calls.push(ctx);
          },
        },
      },
    },
    [FALLBACK]: (ctx) => {
      fallbacks.push(ctx);
    },
  },
});

{
  const ctx = new Context({
    url: "http://tld/one/two/hello/three?query=thing&five=six",
    method: "GET",
  } as Request);

  await ctx.init(srvr).next();
}

{
  const ctx = new Context({
    url: "http://tld/one/to/hello/three?query=thing&five=six",
    method: "GET",
  } as Request);

  await ctx.init(srvr).next();
}

console.log(calls, fallbacks);
