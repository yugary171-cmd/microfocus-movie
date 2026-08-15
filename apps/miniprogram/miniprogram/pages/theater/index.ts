import { RUNTIME_CONFIG } from "../../config/runtime";

type TheaterAction = "favorite" | "comment" | "like" | "share";

type TheaterVideo = {
  id: string;
  url: string;
  dramaTitle: string;
  episodeLabel: string;
  description: string;
  favoriteCount: string;
  commentCount: string;
  likeCount: string;
  shareCount: string;
};

const THEATER_CLIPS: Array<Omit<TheaterVideo, "url">> = [
  {
    id: "moonlight-memory",
    dramaTitle: "她在月光下失忆",
    episodeLabel: "第 08 集 · 月光不会说谎",
    description: "她终于想起那晚的约定，而他仍在原地等她回头。",
    favoriteCount: "2.8 万",
    commentCount: "1,206",
    likeCount: "9.6 万",
    shareCount: "3,412"
  },
  {
    id: "reverse-summer",
    dramaTitle: "再考公",
    episodeLabel: "第 01 集 · 重启的夏天",
    description: "她决定重新出发，把每一次不甘心都变成向前的勇气。",
    favoriteCount: "6.7 万",
    commentCount: "3.0 万",
    likeCount: "13.3 万",
    shareCount: "8,924"
  },
  {
    id: "starlight-home",
    dramaTitle: "归途有星光",
    episodeLabel: "第 03 集 · 灯塔还亮着",
    description: "她回到海边故乡，才发现有些约定从未被潮水带走。",
    favoriteCount: "4.1 万",
    commentCount: "2,184",
    likeCount: "11.2 万",
    shareCount: "5,017"
  },
  {
    id: "beyond-contract",
    dramaTitle: "合约之外",
    episodeLabel: "第 05 集 · 原则松动",
    description: "临时合约本该冷静收场，两个人却开始重新理解彼此。",
    favoriteCount: "5.4 万",
    commentCount: "4,872",
    likeCount: "8.8 万",
    shareCount: "2,640"
  },
  {
    id: "letters-home",
    dramaTitle: "山河来信",
    episodeLabel: "第 02 集 · 祖父的地图",
    description: "年轻摄影师沿着旧信出发，把被时光藏起的故事重新拍下来。",
    favoriteCount: "3.3 万",
    commentCount: "1,908",
    likeCount: "7.4 万",
    shareCount: "1,882"
  },
  {
    id: "invite-her-in",
    dramaTitle: "引她入室",
    episodeLabel: "第 12 集 · 门后有光",
    description: "她踏进那扇门时并不知道，自己会改写整座宅邸的命运。",
    favoriteCount: "9.2 万",
    commentCount: "6,441",
    likeCount: "18.5 万",
    shareCount: "7,203"
  },
  {
    id: "secret-garden",
    dramaTitle: "她的秘密花园",
    episodeLabel: "第 07 集 · 逆袭的种子",
    description: "旧事被翻开的那一夜，她决定不再替任何人沉默。",
    favoriteCount: "7.6 万",
    commentCount: "5,210",
    likeCount: "14.1 万",
    shareCount: "4,558"
  },
  {
    id: "dragon-returns",
    dramaTitle: "龙王归来",
    episodeLabel: "第 04 集 · 当众打脸",
    description: "被轻视的人重新站回牌桌，这一次谁也别想再压他一头。",
    favoriteCount: "12.0 万",
    commentCount: "8,903",
    likeCount: "21.6 万",
    shareCount: "9,774"
  },
  {
    id: "live-in-son",
    dramaTitle: "上门女婿",
    episodeLabel: "第 09 集 · 身份揭晓",
    description: "低到尘埃里的日子结束了，真正的底牌才刚刚亮出来。",
    favoriteCount: "8.5 万",
    commentCount: "7,116",
    likeCount: "16.9 万",
    shareCount: "6,048"
  },
  {
    id: "hidden-healer",
    dramaTitle: "隐世神医",
    episodeLabel: "第 06 集 · 一针定局",
    description: "他本想继续隐姓埋名，直到有人把旧伤重新摆到他面前。",
    favoriteCount: "6.1 万",
    commentCount: "3,774",
    likeCount: "10.8 万",
    shareCount: "3,291"
  }
];

const VIDEOS: TheaterVideo[] = THEATER_CLIPS.map((clip, index) => ({
  ...clip,
  url: RUNTIME_CONFIG.demoVideoUrls[index] ?? RUNTIME_CONFIG.demoVideoUrl
}));

const ACTION_LABELS: Record<TheaterAction, string> = {
  favorite: "已收藏到我的片单",
  comment: "评论区即将开放",
  like: "已点赞，感谢喜欢",
  share: "内部体验不可外部分享"
};

const PULL_REFRESH_THRESHOLD = 96;
const SWIPE_THRESHOLD = 56;

Page({
  data: {
    categories: ["漫画剧", "真人剧", "推荐"],
    activeCategory: "推荐",
    videos: VIDEOS,
    currentIndex: 0,
    currentVideo: VIDEOS[0],
    isPulling: false,
    pullDistance: 0,
    refreshing: false,
    refreshLabel: "下拉刷新内容",
    isFavorite: false,
    isLiked: false
  },

  touchStartY: 0,
  touchStartAt: 0,

  selectCategory(event: WechatMiniprogram.TouchEvent) {
    const category = String(event.currentTarget.dataset.category || "推荐");
    if (!this.data.categories.includes(category)) return;
    this.setData({ activeCategory: category });
    wx.showToast({ title: `已切换到${category}`, icon: "none" });
  },

  openSearch() {
    wx.navigateTo({ url: "/pages/search/index" });
  },

  onGestureStart(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0];
    if (!touch || this.data.refreshing) return;
    this.touchStartY = touch.clientY;
    this.touchStartAt = Date.now();
  },

  onGestureMove(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0];
    if (!touch || this.data.refreshing || this.data.currentIndex !== 0) return;
    const distance = touch.clientY - this.touchStartY;
    if (distance <= 0) return;
    const pullDistance = Math.min(124, Math.round(distance * 0.48));
    this.setData({
      isPulling: true,
      pullDistance,
      refreshLabel: pullDistance >= PULL_REFRESH_THRESHOLD ? "松开刷新内容" : "下拉刷新内容"
    });
  },

  onGestureEnd(event: WechatMiniprogram.TouchEvent) {
    const touch = event.changedTouches[0];
    if (!touch || this.data.refreshing) return;
    const distance = touch.clientY - this.touchStartY;
    const elapsed = Date.now() - this.touchStartAt;
    if (this.data.currentIndex === 0 && distance >= PULL_REFRESH_THRESHOLD) {
      void this.refreshFirstVideo();
      return;
    }
    this.setData({ isPulling: false, pullDistance: 0, refreshLabel: "下拉刷新内容" });
    if (elapsed > 900) return;
    if (distance <= -SWIPE_THRESHOLD) {
      this.changeVideo(this.data.currentIndex + 1);
    } else if (distance >= SWIPE_THRESHOLD && this.data.currentIndex > 0) {
      this.changeVideo(this.data.currentIndex - 1);
    }
  },

  async refreshFirstVideo() {
    this.setData({
      isPulling: false,
      pullDistance: PULL_REFRESH_THRESHOLD,
      refreshing: true,
      refreshLabel: "正在刷新内容…"
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    this.changeVideo(1, "已为你刷新一条新短剧");
    this.setData({ refreshing: false, pullDistance: 0, refreshLabel: "下拉刷新内容" });
  },

  changeVideo(index: number, notice?: string) {
    const nextIndex = Math.max(0, Math.min(index, VIDEOS.length - 1));
    const currentVideo = VIDEOS[nextIndex];
    if (!currentVideo) return;
    if (nextIndex === this.data.currentIndex && !notice) {
      wx.showToast({ title: nextIndex === 0 ? "已经是第一条" : "已经是最后一条", icon: "none" });
      return;
    }
    this.setData({
      currentIndex: nextIndex,
      currentVideo,
      isFavorite: false,
      isLiked: false
    });
    wx.nextTick(() => {
      wx.createVideoContext("theater-video", this).play();
    });
    if (notice) wx.showToast({ title: notice, icon: "none" });
  },

  onVideoReady() {
    wx.createVideoContext("theater-video", this).play();
  },

  handleAction(event: WechatMiniprogram.TouchEvent) {
    const action = event.currentTarget.dataset.action as TheaterAction;
    if (!(action in ACTION_LABELS)) return;
    if (action === "favorite") this.setData({ isFavorite: !this.data.isFavorite });
    if (action === "like") this.setData({ isLiked: !this.data.isLiked });
    wx.showToast({ title: ACTION_LABELS[action], icon: "none" });
  }
});
