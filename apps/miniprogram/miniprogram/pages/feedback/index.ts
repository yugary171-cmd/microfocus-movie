Page({
  data: { feedback: "" },

  onFeedbackInput(event: WechatMiniprogram.Input) {
    this.setData({ feedback: event.detail.value });
  },

  submitFeedback() {
    if (!this.data.feedback.trim()) {
      wx.showToast({ title: "请输入反馈内容", icon: "none" });
      return;
    }
    wx.showToast({ title: "反馈已提交", icon: "success" });
    this.setData({ feedback: "" });
  }
});
