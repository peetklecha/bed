import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALIAS,
  type Config,
  Context,
  ERROR,
  FALLBACK,
  GET,
  PARAM,
  POST,
  PublicError,
  Server,
  USE,
  type WithBody,
} from "./core.ts";
import { listen } from "./node.ts";

const call = (server: Server<Context>, path: string, init?: RequestInit) =>
  server.fetch(new Request(`http://tld${path}`, init));

const order: string[] = [];
const config: Config<Context> = {
  [USE]: [async ({ next }) => {
    order.push("root-mw");
    const res = await next();
    res.headers.set("x-mw", "1");
    return res;
  }],
  [ERROR]: ({ err }) => {
    throw new PublicError(500, `root: ${err.message}`);
  },
  one: {
    two: {
      [PARAM]: {
        [ALIAS]: "param",
        three: {
          [GET]: ({ params, query }) => ({ params, query }),
        },
      },
    },
    [FALLBACK]: ({ setStatus }) => {
      setStatus(404);
      return "one-fallback";
    },
  },
  boom: { [GET]: () => {
    throw new Error("kaboom");
  } },
  nested: {
    [ERROR]: ({ err }) => `nested: ${err.message}`,
    [GET]: ({ next }) => next(new Error("passed")),
    deep: { [GET]: () => {
      throw new Error("deep");
    } },
  },
  public: { [GET]: () => {
    throw new PublicError(418, "teapot");
  } },
  echo: {
    [POST]: async ({ getBody }: WithBody<Context, object>) => await getBody(),
  },
  cookie: {
    [GET]: ({ setCookie, cookies }) => {
      setCookie({ name: "a", value: "1", httpOnly: true });
      setCookie({ name: "b", value: "2" });
      return cookies;
    },
  },
  redirect: { [GET]: ({ redirect }) => redirect("/somewhere") },
  empty: { [GET]: () => {} },
};
const server = new Server<Context>(config);

test("routes params, query, and runs middleware", async () => {
  order.length = 0;
  const res = await call(server, "/one/two/hello/three?q=x");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-mw"), "1");
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.deepEqual(await res.json(), {
    params: { param: "hello" },
    query: { q: "x" },
  });
  assert.deepEqual(order, ["root-mw"]);
});

test("uses nearest fallback on a miss", async () => {
  const res = await call(server, "/one/to/hello/three");
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "one-fallback");
});

test("a miss does not keep matching later path segments", async () => {
  // `boom` exists at the root, but /nope/boom must not route to it
  const res = await call(server, "/nope/boom");
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "Not found.");
});

test("inherited keys like `constructor` are not routes", async () => {
  const res = await call(server, "/constructor");
  assert.equal(res.status, 404);
});

test("root error handler is used", async () => {
  const res = await call(server, "/boom");
  assert.equal(res.status, 500);
  assert.equal(await res.text(), "root: kaboom");
});

test("nearest error handler wins, including next(err)", async () => {
  let res = await call(server, "/nested/deep");
  assert.equal(await res.text(), "nested: deep");
  res = await call(server, "/nested");
  assert.equal(await res.text(), "nested: passed");
});

test("PublicError bypasses error handlers", async () => {
  const res = await call(server, "/public");
  assert.equal(res.status, 418);
  assert.equal(await res.text(), "teapot");
});

test("parses JSON bodies", async () => {
  const res = await call(server, "/echo", {
    method: "POST",
    body: JSON.stringify({ a: 1 }),
  });
  assert.deepEqual(await res.json(), { a: 1 });
});

test("reads and sets cookies", async () => {
  const res = await call(server, "/cookie", { headers: { cookie: "x=y; z=w" } });
  assert.deepEqual(await res.json(), { x: "y", z: "w" });
  assert.deepEqual(res.headers.getSetCookie(), ["a=1; HttpOnly", "b=2"]);
});

test("redirects", async () => {
  const res = await call(server, "/redirect");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/somewhere");
});

test("undefined return gives an empty body", async () => {
  const res = await call(server, "/empty");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

test("without an error handler, errors give 500", async () => {
  const bare = new Server<Context>({ x: { [GET]: () => {
    throw new Error("x");
  } } });
  const res = await call(bare, "/x");
  assert.equal(res.status, 500);
});

test("node adapter serves requests", async () => {
  const http = await new Promise<ReturnType<typeof listen>>((resolve) => {
    const s = listen(server, 0, () => resolve(s));
  });
  try {
    const { port } = http.address() as { port: number };
    const base = `http://localhost:${port}`;
    let res = await fetch(`${base}/one/two/p/three?q=1`);
    assert.deepEqual(await res.json(), {
      params: { param: "p" },
      query: { q: "1" },
    });
    res = await fetch(`${base}/echo`, {
      method: "POST",
      body: JSON.stringify({ hi: true }),
    });
    assert.deepEqual(await res.json(), { hi: true });
    res = await fetch(`${base}/cookie`);
    assert.deepEqual(res.headers.getSetCookie(), ["a=1; HttpOnly", "b=2"]);
    await res.body?.cancel();
  } finally {
    http.close();
  }
});
