import { PlaybackLeaseStatus, type PlaybackLeaseView } from "@microfocus/contracts";
import { obtainWechatLoginCode } from "../platform";
import { getApi, getStoredSession, isMockMode } from "./api";

export async function restoreOrCreatePlaybackLease(
  episodeId: string,
  deviceId: string
): Promise<PlaybackLeaseView> {
  if (getStoredSession()) {
    let active = await getApi().getActivePlaybackLease();
    if (active.recoverAction === "customer_service") {
      throw new Error("未确认播放窗口已达自动恢复上限，请联系客服后再观看锁定集");
    }
    if (active.recoverAction === "recover" && active.lease) {
      active = await getApi().recoverPlaybackLease(active.lease.id, {
        deviceId,
        reason: "client_resume",
        wechatCode: isMockMode() ? "mock-reauth" : await obtainWechatLoginCode()
      });
    }
    if (
      active.lease?.episodeId === episodeId &&
      active.lease.status === PlaybackLeaseStatus.ACTIVE
    ) {
      return active.lease;
    }
  }
  return getApi().createPlaybackLease({ episodeId, deviceId });
}
