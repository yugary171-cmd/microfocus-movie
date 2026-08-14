import { getStoredAccessToken, isMockMode } from "./services/api";

App<IAppOption>({
  globalData: {
    accessToken: getStoredAccessToken(),
    user: null,
    isMock: isMockMode()
  },

  onLaunch() {}
});
