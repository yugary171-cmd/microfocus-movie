import { PrismaClient } from "@prisma/client";
import {
  planTotpReencryption,
  totpRotationSummary
} from "../src/security/rotate-totp-encryption.js";

const prisma = new PrismaClient();

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const currentKey = process.env.TOTP_ENCRYPTION_KEY;
  const previousKey = process.env.TOTP_ENCRYPTION_KEY_PREVIOUS;
  if (!currentKey || !previousKey) {
    throw new Error("TOTP_ENCRYPTION_KEY and TOTP_ENCRYPTION_KEY_PREVIOUS are required");
  }
  const rollback = hasFlag("--rollback");
  const commit = hasFlag("--commit");
  const fromKey = rollback ? currentKey : previousKey;
  const toKey = rollback ? previousKey : currentKey;
  const callbackKey = process.env.CALLBACK_PAYLOAD_ENCRYPTION_KEY;
  const payloadCount = await prisma.callbackEvent.count({
    where: { payloadCiphertext: { not: null } }
  });
  if (
    payloadCount > 0 &&
    (!callbackKey || callbackKey === currentKey || callbackKey === previousKey)
  ) {
    throw new Error(
      "Set a distinct CALLBACK_PAYLOAD_ENCRYPTION_KEY before rotating TOTP encryption keys"
    );
  }
  const admins = await prisma.adminUser.findMany({
    select: { id: true, totpSecretEncrypted: true }
  });
  const plan = planTotpReencryption(admins, fromKey, toKey);
  const mode = commit ? (rollback ? "rollback" : "apply") : "dry-run";
  const summary = totpRotationSummary({
    mode,
    plan,
    currentKey,
    previousKey
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (plan.failures > 0) {
    throw new Error("TOTP re-encryption stopped: some administrator secrets could not be rotated");
  }
  if (!commit) return;
  await prisma.$transaction(async (tx) => {
    for (const row of plan.reencrypt) {
      await tx.adminUser.update({
        where: { id: row.id },
        data: { totpSecretEncrypted: row.nextCiphertext }
      });
    }
    await tx.operationalEvent.create({
      data: {
        eventType: "TOTP_ENCRYPTION_KEY_ROTATION",
        actorType: "system",
        entityType: "AdminUser",
        metadataJson: summary
      }
    });
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "TOTP re-encryption failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
