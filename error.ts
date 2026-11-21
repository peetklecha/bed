/** An error whose message is safe to send to the client, with a status code. */
export class PublicError extends Error {
  errorMessageCanBeViewedByClient = true;
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
