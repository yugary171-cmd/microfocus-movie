import type { EntitlementGrantView, EntitlementSummary } from "@microfocus/contracts";
import { getApi, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { formatDateTime, formatRemainingTime } from "../../utils/format";

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
    remainingLabel: "0秒",
    nearestExpiryLabel: "暂无到期时间",
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
      const summary = await getApi().getEntitlement(this.data.dramaId);
      this.setData({
        summary,
        remainingLabel: formatRemainingTime(summary.remainingSeconds),
        nearestExpiryLabel: formatDateTime(summary.nearestExpiresAt),
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
