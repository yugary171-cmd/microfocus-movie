import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { CATALOG_TAG_GROUPS, parseStoredTagIds, RIGHTS_MATERIAL_DIGEST_LENGTH, RIGHTS_TERRITORY } from "@microfocus/contracts";
import { encryptTotpSecret } from "../src/security/totp-crypto.js";
import { assertTotpSecretBase32, isExampleTotpSecret } from "../src/security/totp-secret.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL and a 12+ character ADMIN_BOOTSTRAP_PASSWORD are required");
  }
  if (process.env.NODE_ENV === "production" && /replace|example|change.?me/i.test(password)) {
    throw new Error("Refusing to seed an example administrator password in production");
  }
  const production = process.env.NODE_ENV === "production";
  const totpSecret = process.env.ADMIN_BOOTSTRAP_TOTP_SECRET;
  const encryptionKey = process.env.TOTP_ENCRYPTION_KEY;
  if (production && (!totpSecret || !encryptionKey)) {
    throw new Error(
      "ADMIN_BOOTSTRAP_TOTP_SECRET and TOTP_ENCRYPTION_KEY are required for a production seed"
    );
  }
  const normalizedTotpSecret = totpSecret ? assertTotpSecretBase32(totpSecret) : undefined;
  if (production && normalizedTotpSecret && isExampleTotpSecret(normalizedTotpSecret)) {
    throw new Error("Refusing to seed an example administrator TOTP secret in production");
  }
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      displayName: email,
      passwordHash: await hash(password, 12),
      role: "ADMIN",
      active: true,
      setupCompletedAt: new Date(),
      sessionVersion: 1,
      totpEnabled: production,
      ...(production && normalizedTotpSecret && encryptionKey
        ? { totpSecretEncrypted: encryptTotpSecret(normalizedTotpSecret, encryptionKey) }
        : {})
    },
    update: {}
  });

  if (process.env.NODE_ENV !== "production") {
    const drama = await prisma.drama.upsert({
      where: { id: "seed-drama-1" },
      create: {
        id: "seed-drama-1",
        title: "微焦之城",
        summary: "用于本地开发的短剧样例。",
        coverUrl: "https://images.example.com/micro-light.jpg",
        category: "都市",
        tagsJson: ["ctag_042", "ctag_014"],
        recommendationRank: 100,
        status: "PUBLISHED",
        editorId: admin.id,
        publishedAt: new Date(),
        rightsRecords: {
          create: {
            version: 1,
            status: "ACTIVE",
            rightsHolder: "本地开发样例",
            validFrom: new Date("2025-01-01T00:00:00.000Z"),
            validUntil: new Date("2035-01-01T00:00:00.000Z"),
            territory: RIGHTS_TERRITORY,
            allowsWechatDistribution: true,
            allowsAdMonetization: true,
            allowsTranscoding: true,
            allowsPromotionalMaterial: true,
            licenseNumber: "LOCAL-DEMO-001",
            reportNumber: "LOCAL-REPORT-001",
            materialObjectKey: "private/local-demo-rights.pdf",
            materialDigestSha256: "0".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH)
          }
        },
        episodes: {
          create: Array.from({ length: 4 }, (_, index) => ({
            episodeNumber: index + 1,
            title: `第${index + 1}集`,
            durationSeconds: 120,
            mediaAssets: {
              create: {
                fileId: `local-demo-file-${index + 1}`,
                version: 1,
                isCurrent: true,
                mediaStatus: "READY",
                transcodeStatus: "READY",
                machineReviewStatus: "APPROVED",
                manualReviewStatus: "APPROVED",
                wechatReviewStatus: "APPROVED"
              }
            }
          }))
        }
      },
      update: {}
    });
    await prisma.dramaReview.upsert({
      where: { id: "seed-review-1" },
      create: {
        id: "seed-review-1",
        dramaId: drama.id,
        reviewerId: admin.id,
        contentVersion: drama.contentVersion,
        status: "APPROVED",
        notes: "Local development seed only"
      },
      update: {}
    });

    const library = await prisma.catalogTag.findMany({ select: { id: true, group: true, name: true } });
    const knownIds = new Set(library.map((tag) => tag.id));
    const dramas = await prisma.drama.findMany({ select: { id: true, tagsJson: true } });
    for (const row of dramas) {
      const stored = parseStoredTagIds(row.tagsJson);
      const next: string[] = [];
      for (const value of stored) {
        if (knownIds.has(value)) {
          if (!next.includes(value)) next.push(value);
          continue;
        }
        const matches = library.filter((tag) => tag.name === value);
        const chosen =
          matches.length === 1
            ? matches[0]
            : CATALOG_TAG_GROUPS.map((group) => matches.find((tag) => tag.group === group.id)).find(Boolean);
        if (chosen && !next.includes(chosen.id)) next.push(chosen.id);
      }
      if (JSON.stringify(next) !== JSON.stringify(stored)) {
        await prisma.drama.update({ where: { id: row.id }, data: { tagsJson: next } });
      }
    }
  }
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Seed failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
