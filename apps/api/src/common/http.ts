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
  next();
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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<JsonResponse>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "Internal server error";

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      code = status === 400 ? "VALIDATION_ERROR" : `HTTP_${status}`;
      message =
        typeof payload === "string"
          ? payload
          : normalizeHttpMessage(payload as Record<string, unknown>, exception.message);
    }

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
