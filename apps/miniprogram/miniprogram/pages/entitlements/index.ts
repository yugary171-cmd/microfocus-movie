import type { EntitlementGrantView, EntitlementSummary } from "@microfocus/contracts";
import { getApi, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  ENTITLEMENT_INCOMPLETE_AD_LABEL,
  ENTITLEMENT_SCOPE_LABEL,
  episodeDurationsFromDrama,
  formatApproximateRemainingEpisodes,
  formatDateTime,
  formatRemainingTime,
  formatRewardUnlockCopy
} from "../../utils/format";

interface GrantView extends EntitlementGrantView {
  sourceLabel: string;
  grantedLabel: string;
  remainingLabel: string;
  grantedAtLabel: string;
  expiresAtLabel: string;
}

Page({
  data: {
    dramaId: "",
    isMock: isMockMode(),
    loading: true,
    error: "",
    summary: null as EntitlementSummary | null,
    remainingLabel: "约 0 集",
    nearestExpiryLabel: "暂无到期时间",
    grantCopy: formatRewardUnlockCopy("", []),
    scopeLabel: ENTITLEMENT_SCOPE_LABEL,
    incompleteAdLabel: ENTITLEMENT_INCOMPLETE_AD_LABEL,
    grants: [] as GrantView[]
  },

  onLoad(options: Record<string, string | undefined>) {
    const dramaId = options.dramaId ? decodeURIComponent(options.dramaId) : "";
    this.setData({ dramaId });
    if (!dramaId) {
      this.setData({ loading: false, error: "缺少短剧编号，请从短剧详情进入权益明细" });
      return;
    }
    void this.loadEntitlement();
  },

  onPullDownRefresh() {
    void this.loadEntitlement().finally(() => wx.stopPullDownRefresh());
  },

  async loadEntitlement() {
    this.setData({ loading: true, error: "" });
    try {
      const [summary, drama] = await Promise.all([
        getApi().getEntitlement(this.data.dramaId),
        getApi().getDrama(this.data.dramaId).catch(() => null)
      ]);
      const durations = episodeDurationsFromDrama(drama);
      this.setData({
        summary,
        remainingLabel: formatApproximateRemainingEpisodes(summary.remainingSeconds, durations),
        nearestExpiryLabel: formatDateTime(summary.nearestExpiresAt),
        grantCopy: formatRewardUnlockCopy(drama?.title ?? "", durations),
        grants: summary.grants.map((grant) => ({
          ...grant,
          sourceLabel: grant.source === "REWARDED_AD" ? "完整观看激励广告" : "平台补偿",
          grantedLabel: formatRemainingTime(grant.grantedSeconds),
          remainingLabel: formatRemainingTime(grant.remainingSeconds),
          grantedAtLabel: formatDateTime(grant.grantedAt),
          expiresAtLabel: formatDateTime(grant.expiresAt)
        }))
      });
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), summary: null, grants: [] });
    } finally {
      this.setData({ loading: false });
    }
  }
});
