/**
 * Domain error with an HTTP status code attached.
 * Throw it from controllers; the global error handler in `middlewares/error.ts`
 * reads `statusCode` and serialises `{ success: false, message }`.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    // Restore prototype chain after extending Error in TS+ESM.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "AppError";
  }
}