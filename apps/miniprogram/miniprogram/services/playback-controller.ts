import {
  clampPlaybackRate,
  PLAYBACK_RATE_DEFAULT,
  type PlaybackHeartbeatRequest,
  type PlaybackHeartbeatResponse
} from "@microfocus/contracts";

export type PlaybackState = PlaybackHeartbeatRequest["state"];
export type HeartbeatTickResult =
  | { status: "idle" | "stale" }
  | { status: "failed"; error: unknown }
  | { status: "confirmed"; response: PlaybackHeartbeatResponse };

export class PlaybackHeartbeatController {
  private acknowledgedSeq = 0;
  private state: PlaybackState = "paused";
  private currentPosition = 0;
  private acknowledgedPosition = 0;
  private playbackRate = PLAYBACK_RATE_DEFAULT;
  private offlineSince: number | null = null;
  private pending: PlaybackHeartbeatRequest | null = null;
  private inFlight = false;
  private active = true;

  setState(state: PlaybackState): void {
    if (!this.active) return;
    this.state = state;
  }

  setPosition(position: number): void {
    this.currentPosition = Math.max(0, Number(position) || 0);
  }

  setInitialPosition(position: number): void {
    this.setPosition(position);
    this.acknowledgedPosition = this.currentPosition;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = clampPlaybackRate(rate);
  }

  setNetworkAvailable(available: boolean, now = Date.now()): void {
    this.offlineSince = available ? null : this.offlineSince ?? now;
  }

  shouldPauseForOffline(now = Date.now(), graceSeconds = 15): boolean {
    return (
      this.state === "playing" &&
      this.offlineSince !== null &&
      now - this.offlineSince >= graceSeconds * 1000
    );
  }

  beginHeartbeat(): PlaybackHeartbeatRequest | null {
    if (!this.active || this.state !== "playing" || this.inFlight) return null;
    if (!this.pending) {
      this.pending = {
        seq: this.acknowledgedSeq + 1,
        mediaPositionSeconds: this.currentPosition,
        previousMediaPositionSeconds: this.acknowledgedPosition,
        playbackRate: this.playbackRate,
        state: "playing"
      };
    }
    this.inFlight = true;
    return { ...this.pending };
  }

  private confirmHeartbeat(
    sentSeq: number,
    acknowledgedSeq: number
  ): "confirmed" | "retry" | "stale" {
    if (!this.active || !this.inFlight || this.pending?.seq !== sentSeq) {
      return "stale";
    }
    this.inFlight = false;
    if (acknowledgedSeq !== sentSeq) {
      return "retry";
    }
    this.acknowledgedSeq = sentSeq;
    this.acknowledgedPosition = this.pending.mediaPositionSeconds;
    this.pending = null;
    return "confirmed";
  }

  private failHeartbeat(sentSeq: number): "retry" | "stale" {
    if (!this.active || !this.inFlight || this.pending?.seq !== sentSeq) {
      return "stale";
    }
    this.inFlight = false;
    return "retry";
  }

  async tick(
    send: (request: PlaybackHeartbeatRequest) => Promise<PlaybackHeartbeatResponse>
  ): Promise<HeartbeatTickResult> {
    const request = this.beginHeartbeat();
    if (!request) return { status: "idle" };
    try {
      const response = await send(request);
      const confirmation = this.confirmHeartbeat(
        request.seq,
        response.acknowledgedSeq
      );
      if (confirmation === "confirmed") {
        return { status: "confirmed", response };
      }
      if (confirmation === "retry") {
        return {
          status: "failed",
          error: new Error("服务端未确认当前播放心跳，将原样重试")
        };
      }
      return { status: "stale" };
    } catch (error) {
      return this.failHeartbeat(request.seq) === "retry"
        ? { status: "failed", error }
        : { status: "stale" };
    }
  }

  stop(): void {
    this.active = false;
    this.state = "background";
    this.pending = null;
    this.inFlight = false;
  }
}
