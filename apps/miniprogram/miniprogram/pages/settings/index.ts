import { clearStoredSession } from "../../services/api";

Page({
  openProfile() {
    wx.navigateTo({ url: "/pages/profile/edit" });
  },

  showFeedback() {
    wx.navigateTo({ url: "/pages/feedback/index" });
  },

  logout() {
    clearStoredSession();
    wx.reLaunch({ url: "/pages/my/index" });
  }
});
