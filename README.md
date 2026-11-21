# Bed

Bed is a small, opinionated library for writing RESTful JSON APIs as a tree of
handlers. It is built on web-standard `Request`/`Response`, so it runs anywhere
a `fetch` handler does: Node, Cloudflare Workers, Deno, and Bun.

## Install

```sh
npx jsr add @peetklecha/bed      # npm / Node / Workers
deno add jsr:@peetklecha/bed     # Deno
```

To import it as plain `bed` (e.g. `import { Server } from "bed"`), alias it in
`package.json` instead (and add `@jsr:registry=https://npm.jsr.io` to `.npmrc`):

```json
{ "dependencies": { "bed": "npm:@jsr/peetklecha__bed@^0.1.0" } }
```

Entry points:

| Import                     | Contents                                         |
| -------------------------- | ------------------------------------------------ |
| `@peetklecha/bed`          | `Server`, `Context`, route symbols, `PublicError` |
| `@peetklecha/bed/node`     | `listen` and adapters for Node's `http` module   |
| `@peetklecha/bed/logging`  | request-logging middleware                       |
| `@peetklecha/bed/client`   | typed client for calling a bed API from a browser |
| `@peetklecha/bed/error`    | `PublicError` alone (no server code)             |
| `@peetklecha/bed/validator`| small payload-validation helpers                 |

## Running a server

A `Server` exposes `fetch(request): Promise<Response>`.

```ts
// Node
import { Server } from "@peetklecha/bed";
import { listen } from "@peetklecha/bed/node";
import api from "./api.ts";

listen(new Server(api), 8080);
```

```ts
// Cloudflare Workers
const server = new Server(api);
export default { fetch: (req) => server.fetch(req) } satisfies ExportedHandler;
```

```ts
// Deno / Bun
Deno.serve({ port: 8080 }, new Server(api).fetch);
Bun.serve({ port: 8080, fetch: new Server(api).fetch });
```

## Routes

The argument to `new Server` is a tree that fully specifies the API -- you
can't add routes after creating the server. String keys are path segments;
symbol keys are handlers and settings.

```ts
import { type Config, Context, GET, POST } from "@peetklecha/bed";

export default {
  [GET]: getRoot, //            GET  /
  users: {
    [GET]: getUsers, //         GET  /users
    [POST]: postUser, //        POST /users
    admins: {
      [GET]: getAdmins, //      GET  /users/admins
    },
  },
} satisfies Config<Context>;
```

Supported methods are `GET`, `POST`, `PUT`, and `DELETE`.

## Handlers

A handler takes the `Context` and **returns** the response:

- a `Response` is sent as-is;
- a string, `Blob`, `ArrayBuffer`, `FormData`, `URLSearchParams`, or
  `ReadableStream` is sent as the body;
- `null`/`undefined` sends an empty body;
- anything else is sent as JSON.

```ts
export async function getUsers({ query }: Context) {
  return await db.users.find(query);
}
```

Useful members of `Context`:

| Member                                     | Description                                          |
| ------------------------------------------ | ---------------------------------------------------- |
| `request`                                  | the underlying `Request`                             |
| `url`                                      | `new URL(request.url)`                               |
| `processedUrl`                             | `{ path, pathString, queryString, fullPathString }`  |
| `params`                                   | values of parametric path segments                   |
| `query`                                    | query-string values                                  |
| `getBody()`                                | the parsed JSON body                                 |
| `cookies`                                  | request cookies, as a record                         |
| `next(err?)`                               | run the next handler; resolves to its `Response`     |
| `setStatus(n)` / `getStatus()`             | response status (default 200)                        |
| `setHeaders` / `assignHeaders` / `getHeaders` | response headers                                  |
| `setCookie(cookie)`                        | add a `Set-Cookie` header                            |
| `redirect(url)`                            | 302 to `url`; `return ctx.redirect("/")`             |
| `setBodyHook(fn)`                          | transform the returned body before it is serialized  |

`query` and `getBody` are typed as `never` by default; declare their shapes
with `WithQuery` and `WithBody`:

```ts
import type { Context, WithBody, WithQuery } from "@peetklecha/bed";

const search = ({ query }: WithQuery<Context, { q: string }>) => find(query.q);
const create = async ({ getBody }: WithBody<Context, { name: string }>) =>
  insert(await getBody());
```

### Extending the context

Middleware can attach properties to the context. Declare the extended type
when you create the server:

```ts
interface MyContext extends Context {
  user: User;
}

const attachUser = async (ctx: MyContext) => {
  ctx.user = await lookUpUser(ctx.cookies.session);
  return ctx.next();
};

new Server<MyContext>({ [USE]: [attachUser], me: { [GET]: ({ user }) => user } });
```

## Parametric routes

```ts
import { ALIAS, GET, PARAM } from "@peetklecha/bed";

export default {
  users: {
    [PARAM]: {
      [ALIAS]: "userId",
      [GET]: ({ params: { userId } }) => db.users.get(userId), // GET /users/:userId
    },
  },
};
```

## Middleware

`[USE]` holds an array of middleware for a router and everything below it.
Middleware calls `next()` to continue and returns the resulting `Response`,
or returns its own response to stop early.

```ts
export default {
  [USE]: [logging],
  users: {
    [USE]: [adminOnly],
    [GET]: getUsers,
  },
};

async function adminOnly(ctx: Context) {
  if (!isAdmin(ctx)) throw new PublicError(401, "Unauthorized");
  const res = await ctx.next();
  await logAdminAction(ctx);
  return res;
}
```

## Fallback handlers

A `[FALLBACK]` handler runs for any request under its router that matches no
endpoint. The nearest fallback wins. The default root fallback sends
`404 Not found.`

```ts
export default {
  users: {
    [FALLBACK]: ({ setStatus }) => {
      setStatus(404);
      return "No such user route.";
    },
    [GET]: getUsers,
  },
};
```

## Error handling

Throw from any handler, or call `next(err)`. The error goes to the nearest
`[ERROR]` handler above the handler that threw, which sees it as `ctx.err`
and returns a response like any other handler.

```ts
export default {
  [ERROR]: ({ err, setStatus }) => {
    console.error(err);
    setStatus(500);
    return "Internal server error.";
  },
  users: { [GET]: getUsers },
};
```

Throwing a `PublicError` skips error handlers and sends its message with its
status code:

```ts
import { PublicError } from "@peetklecha/bed";

throw new PublicError(404, "No such user.");
```

If no error handler applies, or the error handler itself throws a non-public
error, bed responds with 500.

## Body parsing

Request bodies are parsed as JSON eagerly. Parse errors are deferred until
`getBody()` is called. To turn this off:

```ts
new Server(api, { jsonBody: false });
```

## Logging

```ts
import logging from "@peetklecha/bed/logging";

new Server({ [USE]: [logging], ... }); // logs "GET /users 200 1.23ms"
```

Set the `BED_LOG_HANDLERS` environment variable to log each handler as it runs.

## Client

`@peetklecha/bed/client` builds a typed client from your API's type:

```ts
import { api } from "@peetklecha/bed/client";
import type { API } from "../server/api.ts"; // export type API = typeof config

const client = api<API>({ baseUrl: "/" });
const { err, res } = await client.get.users[userId]();
```
