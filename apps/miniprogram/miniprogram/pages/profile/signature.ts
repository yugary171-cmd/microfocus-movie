import { getStoredSession, saveProfile } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { boundSignature, canSaveSignature, SIGNATURE_MAX_LENGTH } from "../../utils/profile";

Page({
  data: {
    original: "",
    signature: "",
    count: 0,
    maxLength: SIGNATURE_MAX_LENGTH,
    canSave: false
  },

  onShow() {
    const session = getStoredSession();
    if (!session) {
      wx.navigateBack();
      return;
    }
    const original = session.user.signature;
    this.setData({
      original,
      signature: original,
      count: Array.from(original).length,
      canSave: false
    });
  },

  onInput(event: WechatMiniprogram.Input) {
    const signature = boundSignature(event.detail.value);
    this.setData({
      signature,
      count: Array.from(signature).length,
      canSave: canSaveSignature(this.data.original, signature)
    });
  },

  async save() {
    if (!this.data.canSave) return;
    try {
      await saveProfile({ signature: boundSignature(this.data.signature) });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
