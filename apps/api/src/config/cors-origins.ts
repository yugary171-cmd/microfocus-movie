const LOCAL_ADMIN_DEV_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"] as const;

export function stripOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** Production: only ADMIN_ORIGIN. Local: also the documented Vite admin port. */
export function resolveAdminCorsOrigins(adminOrigin: string, nodeEnv: string): string[] {
  const allowed = new Set([stripOrigin(adminOrigin)]);
  if (nodeEnv !== "production") {
    for (const origin of LOCAL_ADMIN_DEV_ORIGINS) allowed.add(origin);
  }
  return [...allowed];
}
