import type { Server } from "./core.ts";
import type { Context } from "./lib/context.ts";

export const ONERROR = Symbol("onerror");
export const ONCLOSE = Symbol("onclose");
export const ONOPEN = Symbol("onopen");

export const SOCKET_ERROR = Symbol("socket-error");
export const SOCKET_FALLBACK = Symbol("socket-fallback");

export type SocketServer = {
  wsConfig: WSConfig;
  sockets: BedSocket[];
  rooms: Record<string, Room>;
};
export type WSHandler = (
  data: Record<string, unknown>,
  socket: BedSocket,
  socketServer?: SocketServer,
) => Promise<void> | void;
export type WSErrHandler = (
  err: Error,
  socket: BedSocket,
  socketServer?: SocketServer,
) => Promise<void> | void;
export type WSFallbackHandler = (
  message: Message,
  socket: BedSocket,
  socketServer?: SocketServer,
) => Promise<void> | void;
export type WSConfig = Record<string, WSHandler> & {
  [ONERROR]?: WebSocket["onerror"];
  [ONOPEN]?: WebSocket["onopen"];
  [ONCLOSE]?: WebSocket["onclose"];
  [SOCKET_ERROR]?: WSErrHandler;
  [SOCKET_FALLBACK]?: WSFallbackHandler;
};

export class BedSocket {
  rooms: Room[] = [];
  data: Record<string, unknown> = {};

  constructor(
    public ws: WebSocket,
    public wsConfig: WSConfig = {},
    public socketServer?: SocketServer,
  ) {
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const handler = this.wsConfig?.[data?.type];
      const message = JSON.parse(data?.content ?? "{}");
      if (handler) {
        try {
          handler(message, this, this.socketServer);
        } catch (err) {
          this.wsConfig[SOCKET_ERROR]!(err, this, this.socketServer);
        }
      } else this.wsConfig[SOCKET_FALLBACK]!(message, this, this.socketServer);
    };

    this.ws.onerror = this.wsConfig[ONERROR] || null;
    this.ws.onclose = this.wsConfig[ONCLOSE] || null;
    this.ws.onopen = this.wsConfig[ONOPEN] || null;

    this.wsConfig[SOCKET_ERROR] ||= (err) => console.error(err);
    this.wsConfig[SOCKET_FALLBACK] ||= ({ type, content }) =>
      console.warn(
        `Socket handler not found for ${type} with content:`,
        content,
      );
  }

  static fromUrl(url: string, wsConfig?: WSConfig) {
    return new this(new WebSocket(url), wsConfig);
  }

  set(config: WSConfig) {
    Object.assign(this.wsConfig, config);
  }

  emit(message: Message) {
    this.ws.send(JSON.stringify(message));
  }

  announce(to: string, message: Message) {
    noClient();
    const room = Room.rooms[to];
    if (!room.sockets.has(this)) {
      throw new Error("Can't announce to a room you're not in");
    }
    room.broadcast(message, [this]);
  }

  makeRoom() {
    noClient();
    const room = new Room();
    room.sockets.add(this);
    return room;
  }

  join(id: string) {
    noClient();
    const room = Room.rooms[id];
    room.sockets.add(this);
    this.rooms.push(room);
  }

  leave(id: string) {
    noClient();
    const room = Room.rooms[id];
    room.sockets.delete(this);
  }

  // static prehandler(wsConfig: WSConfig) {
  //   noClient();
  //   return async (event: Deno.RequestEvent) => {
  //     const socketServer = { wsConfig, sockets: [], rooms: Room.rooms };
  //     // const server_: Server<UserDefinedContext> & SocketServer = Object.assign(
  //     //   server,
  //     //   socketServer,
  //     // );
  //     const { request: { headers } } = event;
  //     const isWSReq = headers.get("upgrade")?.toLowerCase?.() === "websocket";
  //     if (isWSReq) {
  //       const { socket, response } = Deno.upgradeWebSocket(event.request);
  //       server_.sockets.push(
  //         new BedSocket(socket, server_.wsConfig, socketServer),
  //       );
  //       await event.respondWith(response);
  //     }
  //     return isWSReq;
  //   };
  // }
	static ServerWithSocket = class ServerWithSockets {
	}
}

export class Room {
  static rooms: Record<string, Room> = {};

  sockets: Set<BedSocket>;
  id: string;
  data: Record<string, unknown> = {};

  constructor() {
    this.sockets = new Set();
    this.id = crypto.randomUUID();
    Room.rooms[this.id] = this;
  }

  broadcast(message: Message, exclude: BedSocket[] = []) {
    for (const socket of this.sockets) {
      if (!exclude.includes(socket)) socket.emit(message);
    }
  }
}

export interface Message {
  type: string;
  content: unknown;
}

function noClient() {
  if (!self.Deno) {
    throw new Error("This function is only for use on back-end.");
  }
}

export interface WSContext {
	ws: SocketServer
}

// export default BedSocket.prehandler;
