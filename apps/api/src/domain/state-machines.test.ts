import { describe, expect, it } from "vitest";
import { REWARD_SECONDS } from "@microfocus/contracts";
import {
  InMemoryHeartbeatSequence,
  InMemoryLeaseRegistry,
  InMemoryRewardCompletion
} from "./state-machines.js";

describe("reward completion idempotency", () => {
  it("does not issue a second grant for duplicate completion", () => {
    const completion = new InMemoryRewardCompletion();
    expect(completion.complete()).toBe(completion.complete());
    expect(completion.complete().seconds).toBe(REWARD_SECONDS);
  });
});

describe("single active playback lease", () => {
  it("revokes the prior lease when concurrent creation is serialized", () => {
    const leases = new InMemoryLeaseRegistry();
    leases.create("first");
    leases.create("second");
    expect(leases.status("first")).toBe("REVOKED");
    expect(leases.status("second")).toBe("ACTIVE");
  });
});

describe("heartbeat sequence idempotency", () => {
  it("returns the same response for a duplicate and rejects older sequence numbers", () => {
    const sequence = new InMemoryHeartbeatSequence();
    const first = sequence.accept(2);
    expect(sequence.accept(2)).toBe(first);
    expect(() => sequence.accept(1)).toThrow("Heartbeat sequence is out of order");
  });
});
