export enum ErrorCode {
  // Booking
  BOOKING_CONFLICT = "BOOKING_CONFLICT",
  SLOT_UNAVAILABLE = "SLOT_UNAVAILABLE",
  BOOKING_NOT_FOUND = "BOOKING_NOT_FOUND",
  BOOKING_ALREADY_CANCELLED = "BOOKING_ALREADY_CANCELLED",
  BOOKING_TOO_LATE_TO_CANCEL = "BOOKING_TOO_LATE_TO_CANCEL",
  BOOKING_IN_PAST = "BOOKING_IN_PAST",

  // Promo & Bonus
  PROMO_INVALID = "PROMO_INVALID",
  PROMO_EXPIRED = "PROMO_EXPIRED",
  PROMO_MAX_USES_REACHED = "PROMO_MAX_USES_REACHED",
  BONUS_INSUFFICIENT = "BONUS_INSUFFICIENT",
  BONUS_EXCEED_MAX_SPEND = "BONUS_EXCEED_MAX_SPEND",

  // Auth & Client
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  CLIENT_NOT_FOUND = "CLIENT_NOT_FOUND",
  CLIENT_ALREADY_EXISTS = "CLIENT_ALREADY_EXISTS",

  // Venue & Resource
  VENUE_NOT_FOUND = "VENUE_NOT_FOUND",
  ADDON_NOT_FOUND = "ADDON_NOT_FOUND",

  // Gift Certificate
  CERTIFICATE_NOT_FOUND = "CERTIFICATE_NOT_FOUND",
  CERTIFICATE_EXPIRED = "CERTIFICATE_EXPIRED",
  CERTIFICATE_ALREADY_REDEEMED = "CERTIFICATE_ALREADY_REDEEMED",

  // Campaign & Messaging
  CAMPAIGN_NOT_FOUND = "CAMPAIGN_NOT_FOUND",
  CAMPAIGN_ALREADY_SENT = "CAMPAIGN_ALREADY_SENT",
  MESSAGE_THROTTLED = "MESSAGE_THROTTLED",

  // General
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function notFound(
  message = "Resource not found",
  code: ErrorCode = ErrorCode.NOT_FOUND,
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, code, 404, details);
}

export function unauthorized(
  message = "Unauthorized",
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, ErrorCode.UNAUTHORIZED, 401, details);
}

export function forbidden(
  message = "Forbidden",
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, ErrorCode.FORBIDDEN, 403, details);
}

export function badRequest(
  message = "Bad request",
  code: ErrorCode = ErrorCode.VALIDATION_ERROR,
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, code, 400, details);
}

export function conflict(
  message = "Conflict",
  code: ErrorCode = ErrorCode.CONFLICT,
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, code, 409, details);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
