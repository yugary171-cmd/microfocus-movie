import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { encryptTotpSecret } from "../src/security/totp-crypto.js";

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
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await hash(password, 12),
      role: "ADMIN",
      active: true,
      totpEnabled: production,
      ...(production && totpSecret && encryptionKey
        ? { totpSecretEncrypted: encryptTotpSecret(totpSecret, encryptionKey) }
        : {})
    },
    update: {}
  });

  if (process.env.NODE_ENV !== "production") {
    const drama = await prisma.drama.upsert({
      where: { id: "seed-drama-1" },
      create: {
        id: "seed-drama-1",
        title: "微光之城",
        summary: "用于本地开发的短剧样例。",
        coverUrl: "https://images.example.com/micro-light.jpg",
        category: "都市",
        tagsJson: ["都市", "成长"],
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
            territory: "CN",
            allowsWechatDistribution: true,
            allowsAdMonetization: true,
            allowsTranscoding: true,
            allowsPromotionalMaterial: true,
            licenseNumber: "LOCAL-DEMO-001",
            reportNumber: "LOCAL-REPORT-001",
            materialObjectKey: "private/local-demo-rights.pdf",
            materialDigestSha256: "0".repeat(64)
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
  }
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Seed failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
