/**
 * `PublicError`, on its own, for code that throws bed errors without
 * importing the server.
 *
 * @example
 * ```ts
 * import { PublicError } from "@peetklecha/bed/error";
 *
 * if (!user) throw new PublicError(404, "No such user.");
 * ```
 *
 * @module
 */

/**
 * An error whose message is safe to show the client. Throwing one from a
 * handler skips error handlers and responds with `statusCode` and `message`.
 */
export class PublicError extends Error {
  /** Always `true`: marks the message as safe to send to the client. */
  errorMessageCanBeViewedByClient = true;
  /** The HTTP status to respond with. */
  statusCode: number;
  /**
   * Create an error that responds with `statusCode` and `message`.
   *
   * @param statusCode The HTTP status to respond with.
   * @param message The response body.
   */
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
