import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32).optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:5174"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  ADMIN_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3600)
    .max(90 * 24 * 60 * 60)
    .default(30 * 24 * 60 * 60),
  ADMIN_REFRESH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  ADMIN_BOOTSTRAP_TOTP_SECRET: z.string().optional(),
  ADMIN_TEST_OTP: z.string().regex(/^\d{6}$/).optional(),
  TOTP_ENCRYPTION_KEY: optionalSecret,
  TOTP_ENCRYPTION_KEY_PREVIOUS: optionalSecret,
  CALLBACK_PAYLOAD_ENCRYPTION_KEY: optionalSecret,
  RELEASE_GATE_ENABLED: booleanString,
  COMPLIANCE_ENTITY_APPROVED: booleanString,
  COMPLIANCE_MINIPROGRAM_FILING: booleanString,
  COMPLIANCE_WECHAT_CATEGORY: booleanString,
  COMPLIANCE_ADS_APPROVED: booleanString,
  WECHAT_MODE: z.enum(["mock", "live"]).default("mock"),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  WECHAT_REWARDED_AD_UNIT_ID: z.string().default("mock-rewarded-ad"),
  WECHAT_REWARD_VERIFICATION: z
    .enum(["server_verified", "client_attestation"])
    .default("client_attestation"),
  INTERNAL_CLIENT_ATTESTATION: booleanString,
  POSTER_STORAGE_MODE: z.enum(["mock", "live"]).default("mock"),
  TENCENTCLOUD_COS_SECRET_ID: z.string().optional(),
  TENCENTCLOUD_COS_SECRET_KEY: z.string().optional(),
  TENCENTCLOUD_COS_BUCKET: z.string().optional(),
  TENCENTCLOUD_COS_REGION: z.string().optional(),
  TENCENTCLOUD_COS_PUBLIC_ORIGIN: z.string().url().optional(),
  TENCENTCLOUD_COS_PREFIX: z.string().default("microfocus/dramas"),
  VOD_MODE: z.enum(["mock", "live"]).default("mock"),
  TENCENTCLOUD_SECRET_ID: z.string().optional(),
  TENCENTCLOUD_SECRET_KEY: z.string().optional(),
  TENCENTCLOUD_VOD_REGION: z.string().default("ap-guangzhou"),
  TENCENTCLOUD_VOD_SUB_APP_ID: z.string().optional(),
  TENCENTCLOUD_VOD_PROCEDURE: z.string().optional(),
  TENCENTCLOUD_VOD_CALLBACK_SECRET: z.string().optional(),
  WECHAT_CALLBACK_SECRET: z.string().optional(),
  VOD_PLAYBACK_KEY: z.string().optional(),
  VOD_MEDIA_HOST: z.string().default("media.example.com")
}).superRefine((data, ctx) => {
  if (data.WECHAT_MODE !== data.VOD_MODE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "WECHAT_MODE and VOD_MODE must both be 'mock' or both be 'live'",
      path: ["WECHAT_MODE", "VOD_MODE"]
    });
  }
  if (
    data.TOTP_ENCRYPTION_KEY &&
    data.TOTP_ENCRYPTION_KEY_PREVIOUS &&
    data.TOTP_ENCRYPTION_KEY === data.TOTP_ENCRYPTION_KEY_PREVIOUS
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TOTP_ENCRYPTION_KEY_PREVIOUS must differ from TOTP_ENCRYPTION_KEY",
      path: ["TOTP_ENCRYPTION_KEY_PREVIOUS"]
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (source === process.env && cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  assertProductionSafety(parsed.data);
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export function assertProductionSafety(env: AppEnv): void {
  if (env.NODE_ENV !== "production") return;
  const complianceReady =
    env.COMPLIANCE_ENTITY_APPROVED &&
    env.COMPLIANCE_MINIPROGRAM_FILING &&
    env.COMPLIANCE_WECHAT_CATEGORY &&
    env.COMPLIANCE_ADS_APPROVED;
  if (!complianceReady) {
    throw new Error("Production startup refused: release gate is incomplete");
  }
  if (!env.PUBLIC_API_URL.startsWith("https://")) {
    throw new Error("Production startup refused: PUBLIC_API_URL must use HTTPS");
  }
  if (!env.ADMIN_ORIGIN.startsWith("https://")) {
    throw new Error("Production startup refused: ADMIN_ORIGIN must use HTTPS");
  }
  if (/replace|example|change.?me/i.test(env.JWT_SECRET)) {
    throw new Error("Production startup refused: JWT_SECRET is an example value");
  }
  if (env.WECHAT_MODE !== "live" || env.VOD_MODE !== "live") {
    throw new Error("Production startup refused: mock providers are forbidden");
  }
  if (env.WECHAT_REWARD_VERIFICATION !== "server_verified") {
    throw new Error("Production startup refused: rewarded ads must be server verified");
  }
  if (env.INTERNAL_CLIENT_ATTESTATION) {
    throw new Error("Production startup refused: INTERNAL_CLIENT_ATTESTATION must be false");
  }
  if (env.ADMIN_TEST_OTP) {
    throw new Error("Production startup refused: ADMIN_TEST_OTP must not be set");
  }
  if (env.ADMIN_BOOTSTRAP_PASSWORD || env.ADMIN_BOOTSTRAP_TOTP_SECRET) {
    throw new Error("Production startup refused: bootstrap secrets must be removed after initialization");
  }
  const liveValues = [
    env.WECHAT_APP_ID,
    env.WECHAT_APP_SECRET,
    env.WECHAT_REWARDED_AD_UNIT_ID,
    env.WECHAT_CALLBACK_SECRET,
    env.TENCENTCLOUD_SECRET_ID,
    env.TENCENTCLOUD_SECRET_KEY,
    ...(env.POSTER_STORAGE_MODE === "live"
      ? [
          env.TENCENTCLOUD_COS_SECRET_ID,
          env.TENCENTCLOUD_COS_SECRET_KEY,
          env.TENCENTCLOUD_COS_BUCKET,
          env.TENCENTCLOUD_COS_REGION,
          env.TENCENTCLOUD_COS_PUBLIC_ORIGIN
        ]
      : []),
    env.TENCENTCLOUD_VOD_SUB_APP_ID,
    env.TENCENTCLOUD_VOD_PROCEDURE,
    env.TENCENTCLOUD_VOD_CALLBACK_SECRET,
    env.VOD_PLAYBACK_KEY,
    env.TOTP_ENCRYPTION_KEY
  ];
  if (liveValues.some((value) => !value || /replace|example|change.?me/i.test(value))) {
    throw new Error("Production startup refused: live provider or TOTP configuration is incomplete");
  }
  throw new Error(
    "Production startup refused: live VOD signing and rewarded-ad verification are not implemented"
  );
}

export function resetEnvForTests(): void {
  cached = undefined;
}
