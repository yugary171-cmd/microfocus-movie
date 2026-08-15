import { getStoredSession, loadProfile, saveProfile } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  formatMicrofocusId,
  GENDER_OPTIONS,
  genderDisplayLabel,
  type ProfileGender
} from "../../utils/profile";

Page({
  data: {
    displayName: "",
    avatarUrl: "",
    initial: "微",
    microfocusId: "",
    signature: "",
    signatureText: "介绍一下自己",
    gender: "unset" as ProfileGender,
    genderText: "请选择性别",
    genderDraft: "unset" as ProfileGender,
    genderOpen: false,
    genderOptions: GENDER_OPTIONS,
    saving: false
  },

  onShow() {
    void this.refresh();
  },

  applyUser(user: { displayName: string; avatarUrl: string | null; id: string; signature: string; gender: ProfileGender }) {
    const displayName = user.displayName || "微信用户";
    this.setData({
      displayName,
      avatarUrl: user.avatarUrl || "",
      initial: displayName.slice(0, 1) || "微",
      microfocusId: formatMicrofocusId(user.id),
      signature: user.signature,
      signatureText: user.signature.trim() || "介绍一下自己",
      gender: user.gender,
      genderText: genderDisplayLabel(user.gender)
    });
  },

  async refresh() {
    const session = getStoredSession();
    if (!session) {
      wx.navigateBack();
      return;
    }
    this.applyUser(session.user);
    try {
      const user = await loadProfile();
      if (user) this.applyUser(user);
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    }
  },

  async onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
    const avatarUrl = String(event.detail?.avatarUrl || "").trim();
    if (!avatarUrl || this.data.saving) return;
    this.setData({ saving: true });
    try {
      const stored = await saveProfile({ avatarUrl });
      this.setData({ avatarUrl: stored?.user.avatarUrl || avatarUrl });
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  openNickname() {
    wx.navigateTo({ url: "/pages/profile/nickname" });
  },

  openSignature() {
    wx.navigateTo({ url: "/pages/profile/signature" });
  },

  openGender() {
    this.setData({ genderDraft: this.data.gender, genderOpen: true });
  },

  closeGender() {
    this.setData({ genderOpen: false });
  },

  stopSheet() {},

  selectGender(event: WechatMiniprogram.TouchEvent) {
    const gender = String(event.currentTarget.dataset.gender || "unset") as ProfileGender;
    this.setData({ genderDraft: gender });
  },

  async saveGender() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const stored = await saveProfile({ gender: this.data.genderDraft });
      const gender = stored?.user.gender ?? this.data.genderDraft;
      this.setData({
        gender,
        genderText: genderDisplayLabel(gender),
        genderOpen: false
      });
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  }
});
