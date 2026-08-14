import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter, requestContext, SuccessEnvelopeInterceptor } from "./common/http.js";
import { applyJsonBodyLimit } from "./common/http-limits.js";
import { mountOpenApiDocs, shouldMountOpenApiDocs } from "./common/open-api.js";
import { RequestLogInterceptor } from "./common/request-log.js";
import { AppConfigService } from "./config/config.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false
  });
  const config = app.get(AppConfigService);
  applyJsonBodyLimit(app);
  app.use(helmet());
  app.use(requestContext);
  app.enableCors({
    origin: [config.env.ADMIN_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  app.useGlobalInterceptors(new RequestLogInterceptor(), new SuccessEnvelopeInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();
  if (shouldMountOpenApiDocs(config.env.NODE_ENV)) {
    mountOpenApiDocs(app);
  }
  await app.listen(config.env.PORT, "0.0.0.0");
}

void bootstrap();
