import { clearStoredSession } from "../../services/api";

Page({
  showFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },

  logout() {
    clearStoredSession();
    wx.reLaunch({ url: "/pages/my/index" });
  }
});
