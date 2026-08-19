import { PrismaClient } from "@prisma/client";
import {
  applyAdminBreakGlass,
  parseBreakGlassCommand,
  prepareBreakGlass
} from "../src/admin/admin-break-glass.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const command = parseBreakGlassCommand(process.env, process.argv.slice(2));
  const prepared = await prepareBreakGlass(command);
  const summary = await prisma.$transaction((tx) => applyAdminBreakGlass(tx, prepared));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.mode === "dry-run") {
    process.stderr.write("Dry-run only. Re-run with --commit after dual approval to apply.\n");
    return;
  }
  process.stderr.write(
    "Scan the otpauth URI immediately, then clear these environment variables and the terminal scrollback. Do not paste secrets into tickets.\n"
  );
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Administrator break-glass recovery failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
