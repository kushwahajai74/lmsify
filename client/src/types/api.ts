/**
 * Backend response envelope shapes. Every successful response from
 * `/api/v1/*` returns `{ success: true, ... }`; errors return
 * `{ success: false, message }` (see `server/src/middlewares/error.ts`).
 */

export interface ApiSuccess<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: unknown;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiError;
