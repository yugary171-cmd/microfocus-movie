import { JSON_BODY_LIMIT } from "@microfocus/contracts";

type BodyParserApp = {
  useBodyParser(
    parser: "json" | "urlencoded",
    options?: { limit: string; extended?: boolean }
  ): unknown;
};

export function applyJsonBodyLimit(app: BodyParserApp): void {
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: JSON_BODY_LIMIT, extended: true });
}
