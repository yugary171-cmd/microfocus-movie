import { fileURLToPath, URL } from "node:url";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";
import { resolveDemoMediaOrigin, writeMiniprogramDemoMediaOrigin } from "../../scripts/demo-media-origin";

const demoMediaOrigin = resolveDemoMediaOrigin();
writeMiniprogramDemoMediaOrigin(demoMediaOrigin);
console.info(`[microfocus] mock video origin for this build: ${demoMediaOrigin}`);

export default defineConfig({
  plugins: [uni()],
  define: {
    "import.meta.env.VITE_DEMO_MEDIA_ORIGIN": JSON.stringify(demoMediaOrigin)
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@microfocus/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      )
    }
  }
});
