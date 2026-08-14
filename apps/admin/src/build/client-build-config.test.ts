import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertLiveClientArtifact,
  assertLivePublicApiUrl,
  ClientBuildConfigError,
  collectLiveArtifactViolations,
  parseDotEnvKeys,
  resolveClientBuildConfig,
} from "../../../../scripts/client-build-config";

describe("client live build config", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps mock builds usable without a public API URL", () => {
    expect(
      resolveClientBuildConfig({
        MICROFOCUS_CLIENT_MODE: "mock",
        MICROFOCUS_PUBLIC_API_URL: "",
        VITE_API_BASE_URL: "",
      }),
    ).toMatchObject({ mode: "mock", apiBaseUrl: "" });
  });

  it("accepts an internal HTTP API URL only in mock mode", () => {
    expect(
      resolveClientBuildConfig({
        MICROFOCUS_CLIENT_MODE: "mock",
        MICROFOCUS_PUBLIC_API_URL: "http://192.168.1.8:3000/",
      }).apiBaseUrl,
    ).toBe("http://192.168.1.8:3000");
  });

  it("fails live builds that lack a public HTTPS API origin", () => {
    expect(() =>
      resolveClientBuildConfig({
        MICROFOCUS_CLIENT_MODE: "live",
        MICROFOCUS_PUBLIC_API_URL: "",
        VITE_API_BASE_URL: "",
      }),
    ).toThrow(ClientBuildConfigError);
  });

  it("accepts a WeChat-legal HTTPS origin and prefers MICROFOCUS_PUBLIC_API_URL", () => {
    expect(
      assertLivePublicApiUrl("https://api.example.com/"),
    ).toBe("https://api.example.com");
    expect(
      resolveClientBuildConfig({
        MICROFOCUS_CLIENT_MODE: "live",
        MICROFOCUS_PUBLIC_API_URL: "https://api.example.com",
        VITE_API_BASE_URL: "http://localhost:3000",
      }).apiBaseUrl,
    ).toBe("https://api.example.com");
  });

  it("rejects localhost, IP, http, ports, and credentials in live URLs", () => {
    const invalid = [
      "http://api.example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://192.168.1.8",
      "https://api.example.com:8443",
      "https://user:pass@api.example.com",
      "https://api.example.com/v1",
      "https://api.example.com/?x=1",
    ];
    for (const url of invalid) {
      expect(() => assertLivePublicApiUrl(url), url).toThrow(ClientBuildConfigError);
    }
  });

  it("reads only client keys from dotenv text", () => {
    expect(
      parseDotEnvKeys(
        [
          "JWT_SECRET=should-not-be-read",
          "MICROFOCUS_PUBLIC_API_URL=https://api.example.com",
          "VITE_API_BASE_URL=https://ignored.example.com",
        ].join("\n"),
        ["MICROFOCUS_PUBLIC_API_URL"],
      ),
    ).toEqual({ MICROFOCUS_PUBLIC_API_URL: "https://api.example.com" });
  });

  it("fails live artifact scans when Demo media markers are present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "microfocus-live-artifact-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "app.js"), "http://127.0.0.1:5174/demo/short-drama.mp4");
    expect(collectLiveArtifactViolations(dir).length).toBeGreaterThan(0);
    expect(() => assertLiveClientArtifact(dir)).toThrow(/Demo 媒体/);
  });

  it("accepts live artifacts without Demo media markers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "microfocus-live-artifact-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "app.js"), 'apiBaseUrl:"https://api.example.com"');
    expect(collectLiveArtifactViolations(dir)).toEqual([]);
  });
});
