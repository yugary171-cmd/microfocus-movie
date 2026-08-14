import { HttpException, HttpStatus } from "@nestjs/common";

export class AppError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus
  ) {
    super(message, status);
  }
}

export const Errors = {
  badRequest: (code: string, message: string) =>
    new AppError(code, message, HttpStatus.BAD_REQUEST),
  unauthorized: (message = "Authentication required", code = "UNAUTHORIZED") =>
    new AppError(code, message, HttpStatus.UNAUTHORIZED),
  forbidden: (code = "FORBIDDEN", message = "Permission denied") =>
    new AppError(code, message, HttpStatus.FORBIDDEN),
  notFound: (resource: string) =>
    new AppError("NOT_FOUND", `${resource} not found`, HttpStatus.NOT_FOUND),
  conflict: (code: string, message: string) =>
    new AppError(code, message, HttpStatus.CONFLICT),
  rateLimited: (message: string) =>
    new AppError("RATE_LIMITED", message, HttpStatus.TOO_MANY_REQUESTS),
  providerNotConfigured: (provider: string) =>
    new AppError(
      "PROVIDER_NOT_CONFIGURED",
      `${provider} live provider is not configured`,
      HttpStatus.SERVICE_UNAVAILABLE
    ),
  providerUnavailable: (provider: string) =>
    new AppError(
      "PROVIDER_CIRCUIT_OPEN",
      `${provider} is temporarily unavailable`,
      HttpStatus.SERVICE_UNAVAILABLE
    ),
  providerRequestFailed: (provider: string) =>
    new AppError(
      "PROVIDER_REQUEST_FAILED",
      `${provider} failed`,
      HttpStatus.BAD_GATEWAY
    ),
  providerRejected: (provider: string, providerCode: number) =>
    new AppError(
      "PROVIDER_REJECTED",
      `${provider} was rejected (${providerCode})`,
      HttpStatus.UNAUTHORIZED
    )
};
