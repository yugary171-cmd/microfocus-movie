import { BEARER_TOKEN_MAX_LENGTH } from "@microfocus/contracts";
import { Errors } from "./app-error.js";

export function requireBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith("Bearer ")) throw Errors.unauthorized();
  const token = authorization.slice(7);
  if (!token || token.length > BEARER_TOKEN_MAX_LENGTH) {
    throw Errors.unauthorized("Invalid or expired access token");
  }
  return token;
}
