import type { BahadErrorCode, BahadErrorShape } from "./types";

export const ERROR_CODES: readonly BahadErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid",
  "rate_limited",
  "app_disabled",
  "conflict",
] as const;

export const HTTP_STATUS: Record<BahadErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  rate_limited: 429,
  app_disabled: 423,
  conflict: 409,
};

export class BahadError extends Error implements BahadErrorShape {
  readonly code: BahadErrorCode;
  constructor(code: BahadErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BahadError";
    this.code = code;
  }
  toJSON(): BahadErrorShape {
    return { code: this.code, message: this.message };
  }
}

export function isErrorShape(v: unknown): v is BahadErrorShape {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as BahadErrorShape).code === "string" &&
    (ERROR_CODES as readonly string[]).includes((v as BahadErrorShape).code) &&
    typeof (v as BahadErrorShape).message === "string"
  );
}

/** Converts anything thrown into a safe error shape (never leaks internals). */
export function toErrorShape(e: unknown): BahadErrorShape {
  if (e instanceof BahadError) return e.toJSON();
  if (isErrorShape(e)) return { code: e.code, message: e.message };
  return { code: "invalid", message: "internal error" };
}
