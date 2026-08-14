import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { AppError } from "./app-error.js";

type HeaderRequest = {
  header(name: string): string | undefined;
};

type JsonResponse = {
  setHeader(name: string, value: string): void;
  status(status: number): JsonResponse;
  json(body: unknown): void;
};

export type RequestWithContext = HeaderRequest & { requestId: string };

const requestStore = new AsyncLocalStorage<{ requestId: string }>();

export function currentRequestId(): string {
  return requestStore.getStore()?.requestId ?? "";
}

export function requestContext(
  request: RequestWithContext,
  response: JsonResponse,
  next: () => void
): void {
  const candidate = request.header("x-request-id");
  request.requestId =
    candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)
      ? candidate
      : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  requestStore.run({ requestId: request.requestId }, next);
}

@Injectable()
export class SuccessEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    return next.handle().pipe(
      map((data) => ({ data: data ?? null, requestId: request.requestId }))
    );
  }
}

export function describeHttpException(exception: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (exception instanceof AppError) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    return {
      status,
      code: status === 400 ? "VALIDATION_ERROR" : `HTTP_${status}`,
      message:
        typeof payload === "string"
          ? payload
          : normalizeHttpMessage(payload as Record<string, unknown>, exception.message)
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_ERROR",
    message: "Internal server error"
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<JsonResponse>();
    const { status, code, message } = describeHttpException(exception);
    response.status(status).json({ code, message, requestId: request.requestId });
  }
}

function normalizeHttpMessage(payload: Record<string, unknown>, fallback: string): string {
  const value = payload["message"];
  if (Array.isArray(value)) return value.map(String).join("; ");
  return typeof value === "string" ? value : fallback;
}

export function controllerPath(path: string): string {
  return path.replace(/^\//, "");
}

export function nestedControllerPath(fullPath: string, prefix: string): string {
  const path = controllerPath(fullPath);
  const base = controllerPath(prefix);
  if (path === base) return "";
  const nested = `${base}/`;
  if (!path.startsWith(nested)) {
    throw new Error(`Route ${fullPath} is not under controller prefix ${prefix}`);
  }
  return path.slice(nested.length);
}
