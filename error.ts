export class PublicError extends Error {
  errorMessageCanBeViewedByClient = true;
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}
