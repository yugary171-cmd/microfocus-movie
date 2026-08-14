import { assertLiveClientArtifact, ClientBuildConfigError } from "./client-build-config";

const target = process.argv[2];
if (!target) {
  console.error("Usage: tsx scripts/assert-live-client-artifact.ts <artifact-dir>");
  process.exit(1);
}

try {
  assertLiveClientArtifact(target);
} catch (error) {
  const message = error instanceof ClientBuildConfigError ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
