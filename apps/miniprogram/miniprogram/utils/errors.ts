const FALLBACK_MESSAGE = "服务暂时不可用，请稍后重试";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly requestId = ""
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function toFriendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.message.trim()) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return FALLBACK_MESSAGE;
}
