import { ERROR_CODES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../common/app-error.js";
import { liveHealth, readyHealth } from "./health.js";
import { ProcessDrain } from "./process-drain.js";

describe("process health probes", () => {
  it("reports ready when the database answers and the process is not draining", async () => {
    const drain = new ProcessDrain();
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) };
    await expect(readyHealth(prisma, drain)).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("fails readiness while draining without querying the database", async () => {
    const drain = new ProcessDrain();
    drain.markDraining();
    const prisma = { $queryRaw: vi.fn() };
    await expect(readyHealth(prisma, drain)).rejects.toBeInstanceOf(AppError);
    await expect(readyHealth(prisma, drain)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_READY,
      message: "Process is draining"
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("fails readiness on database errors without leaking connection details", async () => {
    const drain = new ProcessDrain();
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("mysql://secret@localhost:3306/app"))
    };
    await expect(readyHealth(prisma, drain)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_READY,
      message: "Database is not ready"
    });
  });

  it("marks draining on application shutdown", () => {
    const drain = new ProcessDrain();
    expect(drain.isDraining()).toBe(false);
    drain.beforeApplicationShutdown();
    expect(drain.isDraining()).toBe(true);
  });
});
