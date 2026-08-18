type HomeDrama = {
  id: string;
  title: string;
  subtitle: string;
  heat: string;
  ranking: string;
  tone: "mist" | "rose" | "gold" | "jade" | "violet" | "night";
};

const dramas: HomeDrama[] = [
  { id: "mock-return", title: "归途第一季", subtitle: "悬疑 · 全 36 集", heat: "4620 万热度", ranking: "AI 剧收藏榜 No.2", tone: "mist" },
  { id: "mock-room", title: "引她入室", subtitle: "都市 · 全 58 集", heat: "4065 万热度", ranking: "大女主 · 真人剧榜 No.3", tone: "rose" },
  { id: "mock-home", title: "小公主回家", subtitle: "甜宠 · 全 72 集", heat: "4623 万热度", ranking: "评论破 10 万", tone: "gold" },
  { id: "mock-glory", title: "十八岁奶奶驾到", subtitle: "豪门 · 全 64 集", heat: "4053 万热度", ranking: "本周上新 No.1", tone: "jade" },
  { id: "mock-moon", title: "月光落在你肩上", subtitle: "爱情 · 全 48 集", heat: "3826 万热度", ranking: "追更榜 No.4", tone: "violet" },
  { id: "mock-secret", title: "她的秘密花园", subtitle: "逆袭 · 全 52 集", heat: "3511 万热度", ranking: "好评榜 No.6", tone: "night" }
];

function measureNavInsetTop(): number {
  try {
    const info = wx.getSystemInfoSync();
    const statusBar = Number(info.statusBarHeight) || 20;
    const menu = wx.getMenuButtonBoundingClientRect();
    const menuBottom = Number(menu?.bottom);
    return (Number.isFinite(menuBottom) && menuBottom > 0 ? menuBottom : statusBar + 32) + 8;
  } catch {
    return 52;
  }
}

Page({
  data: {
    navInsetTop: 52,
    isMock: true,
    activeChannel: "推荐",
    channels: ["推荐", "战神", "赘婿", "甜宠", "重生", "宫斗", "萌宝", "神医", "兵王"],
    quickActions: [
      { icon: "/assets/icons/icon-filter.svg", label: "筛选", tone: "purple" },
      { icon: "/assets/icons/icon-fire.svg", label: "排行榜", tone: "orange" },
      { icon: "/assets/icons/icon-play-white.svg", label: "新剧", tone: "cyan" }
    ],
    dramas
  },

  onLoad() {
    this.setData({ navInsetTop: measureNavInsetTop() });
  },

  openSearch() {
    wx.navigateTo({ url: "/pages/search/index" });
  },

  selectChannel(event: WechatMiniprogram.TouchEvent) {
    this.setData({ activeChannel: String(event.currentTarget.dataset.channel || "推荐") });
  },

  showAction(event: WechatMiniprogram.TouchEvent) {
    const label = String(event.currentTarget.dataset.label || "功能");
    if (label === "筛选") {
      wx.navigateTo({ url: "/pages/category/index" });
      return;
    }
    if (label === "排行榜") {
      wx.navigateTo({ url: "/pages/ranking/index" });
      return;
    }
    if (label === "新剧") {
      wx.navigateTo({ url: "/pages/search/index" });
      return;
    }
    wx.showToast({ title: `${label}功能为体验数据`, icon: "none" });
  },

  openTheater() {
    wx.switchTab({ url: "/pages/theater/index" });
  }
});
