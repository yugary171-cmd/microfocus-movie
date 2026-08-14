import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { describeHttpException, type RequestWithContext } from "./http.js";

export type RequestLogInput = {
  requestId?: string;
  module?: string;
  method?: string;
  url?: string;
  status: number;
  code: string;
  durationMs: number;
  actorKind?: string;
  actorId?: string;
};

const SKIP_PATHS = /^\/(?:health|docs)(?:\/|$)/i;

export function sanitizeRequestPath(url: string | undefined): string {
  const path = (url ?? "/").split("?")[0]?.split("#")[0] || "/";
  return path.slice(0, 256);
}

export function shouldSkipRequestLog(path: string): boolean {
  return SKIP_PATHS.test(path);
}

export function buildRequestLog(input: RequestLogInput): Record<string, string | number> | null {
  const path = sanitizeRequestPath(input.url);
  if (shouldSkipRequestLog(path)) return null;
  const method = (input.method ?? "GET").toUpperCase().slice(0, 16);
  const actorKind = (input.actorKind ?? "anonymous").slice(0, 32);
  return {
    requestId: (input.requestId ?? "").slice(0, 128),
    module: (input.module ?? "Unknown").slice(0, 64),
    method,
    path,
    status: input.status,
    code: input.code.slice(0, 64),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    actorKind,
    actorId: actorKind === "anonymous" ? "" : (input.actorId ?? "").slice(0, 64)
  };
}

type LoggedRequest = RequestWithContext & {
  method?: string;
  originalUrl?: string;
  url?: string;
  principal?: { kind?: string; sub?: string };
};

type StatusResponse = { statusCode?: number };

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Http");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<LoggedRequest>();
    const response = http.getResponse<StatusResponse>();
    const moduleName = context.getClass().name.replace(/Controller$/, "") || "Unknown";

    const write = (status: number, code: string): void => {
      const line = buildRequestLog({
        status,
        code,
        durationMs: Date.now() - started,
        module: moduleName,
        ...(request.requestId ? { requestId: request.requestId } : {}),
        ...(request.method ? { method: request.method } : {}),
        ...((request.originalUrl ?? request.url)
          ? { url: request.originalUrl ?? request.url }
          : {}),
        ...(request.principal?.kind ? { actorKind: request.principal.kind } : {}),
        ...(request.principal?.sub ? { actorId: request.principal.sub } : {})
      });
      if (!line) return;
      const serialized = JSON.stringify(line);
      if (status >= 500) this.logger.error(serialized);
      else if (status >= 400) this.logger.warn(serialized);
      else this.logger.log(serialized);
    };

    return next.handle().pipe(
      tap(() => write(response.statusCode ?? 200, "OK")),
      catchError((error: unknown) => {
        const described = describeHttpException(error);
        write(described.status, described.code);
        throw error;
      })
    );
  }
}
