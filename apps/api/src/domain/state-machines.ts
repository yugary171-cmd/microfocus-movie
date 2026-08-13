import { Errors } from "../common/app-error.js";

export type ChallengeGrant = { id: string; seconds: number };

export class InMemoryRewardCompletion {
  private grant: ChallengeGrant | undefined;

  complete(): ChallengeGrant {
    if (!this.grant) this.grant = { id: "grant-1", seconds: 600 };
    return this.grant;
  }
}

export class InMemoryLeaseRegistry {
  private activeLeaseId: string | undefined;
  private statuses = new Map<string, "ACTIVE" | "REVOKED">();

  create(leaseId: string): string {
    if (this.activeLeaseId) this.statuses.set(this.activeLeaseId, "REVOKED");
    this.activeLeaseId = leaseId;
    this.statuses.set(leaseId, "ACTIVE");
    return leaseId;
  }

  status(leaseId: string): "ACTIVE" | "REVOKED" | undefined {
    return this.statuses.get(leaseId);
  }
}

export class InMemoryHeartbeatSequence {
  private lastSeq = 0;
  private responses = new Map<number, { acknowledgedSeq: number }>();

  accept(seq: number): { acknowledgedSeq: number } {
    const existing = this.responses.get(seq);
    if (existing) return existing;
    if (seq <= this.lastSeq) {
      throw Errors.conflict("HEARTBEAT_OUT_OF_ORDER", "Heartbeat sequence is out of order");
    }
    const response = { acknowledgedSeq: seq };
    this.responses.set(seq, response);
    this.lastSeq = seq;
    return response;
  }
}
