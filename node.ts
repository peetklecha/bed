/**
 * Run a bed server on Node's built-in `http` module.
 *
 * ```ts
 * import { Server } from "@peetklecha/bed";
 * import { listen } from "@peetklecha/bed/node";
 *
 * listen(new Server(config), 8080);
 * ```
 *
 * @module
 */
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/** Anything with a web-standard fetch handler, such as a bed `Server`. */
export type FetchHandler = {
  fetch: (req: Request) => Response | Promise<Response>;
};

/** Convert a Node request into a web-standard `Request`. */
export function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      headers.append(key, v);
    }
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // required by Node's fetch implementation when body is a stream
    duplex: hasBody ? "half" : undefined,
  } as RequestInit);
}

/** Write a web-standard `Response` to a Node response. */
export async function writeResponse(
  response: Response,
  res: ServerResponse,
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") headers[key] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, response.statusText, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const body = Readable.fromWeb(response.body as NodeReadableStream);
  await new Promise<void>((resolve, reject) => {
    body.on("error", reject);
    res.on("finish", resolve);
    res.on("error", reject);
    body.pipe(res);
  });
}

/** Wrap a fetch handler as a Node `http` request listener. */
export function toNodeHandler(
  server: FetchHandler,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await writeResponse(await server.fetch(toRequest(req)), res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };
}

/** Start a Node http server for a bed `Server` on the given port. */
export function listen(
  server: FetchHandler,
  port: number,
  onListen: () => void = () => console.log(`Listening on ${port}`),
): HttpServer {
  return createServer(toNodeHandler(server)).listen(port, onListen);
}
