import { fileURLToPath, URL } from "node:url";
import uni from "@dcloudio/vite-plugin-uni";
import { defineConfig } from "vite";
import { applyClientBuildArtifacts } from "../../scripts/client-build-config";

const clientBuild = applyClientBuildArtifacts();
const demoMediaModule = fileURLToPath(
  new URL(
    clientBuild.mode === "live" ? "./src/config/demo-media.live.ts" : "./src/config/demo-media.ts",
    import.meta.url,
  ),
);

if (clientBuild.mode === "mock") {
  console.info(`[microfocus] mock video origin for this build: ${clientBuild.demoMediaOrigin}`);
} else {
  console.info("[microfocus] live uni-app build: Demo media disabled");
}

export default defineConfig({
  plugins: [uni()],
  define: {
    "import.meta.env.VITE_DEMO_MEDIA_ORIGIN": JSON.stringify(clientBuild.demoMediaOrigin),
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(clientBuild.apiBaseUrl)
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@microfocus/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      ),
      [fileURLToPath(new URL("./src/config/demo-media.ts", import.meta.url))]: demoMediaModule
    }
  }
});
