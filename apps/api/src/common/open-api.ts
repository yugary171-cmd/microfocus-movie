import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function shouldMountOpenApiDocs(nodeEnv: string): boolean {
  return nodeEnv !== "production";
}

export function mountOpenApiDocs(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Microfocus Movie API")
      .setVersion("1.0")
      .addBearerAuth()
      .build()
  );
  SwaggerModule.setup("docs", app, document);
}
