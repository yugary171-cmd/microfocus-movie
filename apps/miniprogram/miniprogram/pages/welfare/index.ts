const tasks = [
  { id: "sign", title: "每日签到", subtitle: "连续签到可领取体验时长", reward: "+ 20 分钟", done: false },
  { id: "follow", title: "关注好剧", subtitle: "收藏一部想看的短剧", reward: "+ 10 分钟", done: false },
  { id: "invite", title: "邀请好友", subtitle: "好友首次进入剧场后到账", reward: "+ 60 分钟", done: false }
];

Page({
  data: { balance: "80 分钟", tasks },
  claim(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    const current = this.data.tasks.find((task) => task.id === id);
    if (!current || current.done) return;
    this.setData({ tasks: this.data.tasks.map((task) => task.id === id ? { ...task, done: true } : task) });
    wx.showToast({ title: "Mock 福利已领取", icon: "success" });
  }
});
