import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter, requestContext, SuccessEnvelopeInterceptor } from "./common/http.js";
import { AppConfigService } from "./config/config.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get(AppConfigService);
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
  app.useGlobalInterceptors(new SuccessEnvelopeInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Microfocus Movie API")
      .setVersion("1.0")
      .addBearerAuth()
      .build()
  );
  SwaggerModule.setup("docs", app, document);
  await app.listen(config.env.PORT, "0.0.0.0");
}

void bootstrap();
