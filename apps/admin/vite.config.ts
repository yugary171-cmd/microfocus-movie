import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { resolveDemoMediaOrigin, writeMiniprogramDemoMediaOrigin } from "../../scripts/demo-media-origin";

const demoMediaOrigin = resolveDemoMediaOrigin();
writeMiniprogramDemoMediaOrigin(demoMediaOrigin);
console.info(`[microfocus] mock videos on LAN: ${demoMediaOrigin}/demo/`);

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
