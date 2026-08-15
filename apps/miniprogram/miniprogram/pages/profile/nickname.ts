import { getStoredSession, saveProfile } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { boundNickname, canSaveNickname, clipNicknameInput, NICKNAME_MAX_LENGTH } from "../../utils/profile";

Page({
  data: {
    original: "",
    nickname: "",
    count: 0,
    maxLength: NICKNAME_MAX_LENGTH,
    canSave: false
  },

  onShow() {
    const session = getStoredSession();
    if (!session) {
      wx.navigateBack();
      return;
    }
    const original = session.user.displayName || "";
    const nickname = clipNicknameInput(original);
    this.setData({
      original,
      nickname,
      count: Array.from(nickname).length,
      canSave: false
    });
  },

  onInput(event: WechatMiniprogram.Input) {
    const nickname = clipNicknameInput(event.detail.value);
    this.setData({
      nickname,
      count: Array.from(nickname).length,
      canSave: canSaveNickname(this.data.original, nickname)
    });
  },

  clear() {
    this.setData({ nickname: "", count: 0, canSave: false });
  },

  async save() {
    if (!this.data.canSave) return;
    try {
      await saveProfile({ displayName: boundNickname(this.data.nickname) });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
