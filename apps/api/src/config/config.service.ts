import { Injectable } from "@nestjs/common";
import { loadEnv, type AppEnv } from "./env.js";

@Injectable()
export class AppConfigService {
  readonly env: AppEnv = loadEnv();

  get clientAttestationAllowed(): boolean {
    return this.env.NODE_ENV !== "production" || this.env.INTERNAL_CLIENT_ATTESTATION;
  }
}
