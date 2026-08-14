import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { applyClientBuildArtifacts } from "../../scripts/client-build-config";

const clientBuild = applyClientBuildArtifacts();
if (clientBuild.mode === "mock") {
  console.info(`[microfocus] mock videos on LAN: ${clientBuild.demoMediaOrigin}/demo/`);
} else {
  console.info("[microfocus] live admin build: Demo media disabled");
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@microfocus/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    cors: true,
    allowedHosts: true,
  },
});
