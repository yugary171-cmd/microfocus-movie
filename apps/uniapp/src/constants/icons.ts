/** Iconfont is the only icon source for the watch client. Search: https://www.iconfont.cn/search/index?searchType=icon */
export const ICONFONT_SEARCH_URL =
  "https://www.iconfont.cn/search/index?searchType=icon&page=1&fromCollection=-1";

export const ICONFONT_QUERIES = {
  star: "收藏 五角星 圆角 面性",
  comment: "评论 气泡 三点 圆角",
  heart: "点赞 爱心 圆角 面性",
  share: "分享 箭头 圆角"
} as const;

export const ACTION_ICONS = {
  starGold: "/static/icons/star-gold.png",
  starWhite: "/static/icons/star-white.png",
  comment: "/static/icons/comment.png",
  heart: "/static/icons/heart.png",
  heartActive: "/static/icons/heart-active.png",
  share: "/static/icons/share.png"
} as const;
