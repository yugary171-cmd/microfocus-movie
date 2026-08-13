import { ensureSession, getStoredAccessToken, isMockMode } from "./services/api";

App<IAppOption>({
  globalData: {
    accessToken: getStoredAccessToken(),
    user: null,
    isMock: isMockMode()
  },

  onLaunch() {
    void this.ensureSession().catch(() => {
      // Pages expose actionable errors; launch remains quiet to avoid duplicate toasts.
    });
  },

  async ensureSession() {
    const session = await ensureSession();
    this.globalData.accessToken = session.accessToken;
    this.globalData.user = session.user;
  }
});
