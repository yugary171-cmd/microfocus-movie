import { getStoredAccessToken, isMockMode } from "./services/api";

App<IAppOption>({
  globalData: {
    accessToken: getStoredAccessToken(),
    user: null,
    isMock: isMockMode()
  },

  onLaunch() {
    if (!isMockMode()) return;
    try {
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    } catch {
      // ignore
    }
  }
});
