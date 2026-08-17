export type LocalCommentReply = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likeCount: number;
};

export type LocalComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likeCount: number;
  replies: LocalCommentReply[];
};

const SAMPLE_COMMENTS: LocalComment[] = [
  {
    id: "c1",
    author: "柯氏集团的黄涛",
    text: "这一段拍得太稳了，办公室戏终于有人味。",
    createdAt: "2025-08-02",
    likeCount: 325,
    replies: [
      {
        id: "c1-r1",
        author: "路过的编剧",
        text: "桌板声音是后期补的，现场其实没那么响。",
        createdAt: "2025-08-02",
        likeCount: 18
      },
      {
        id: "c1-r2",
        author: "追剧的阿宁",
        text: "终于不是工具人霸总了。",
        createdAt: "2025-08-03",
        likeCount: 6
      }
    ]
  },
  {
    id: "c2",
    author: "夜班看剧人",
    text: "第 3 集开始要看广告，规则说得还算清楚。",
    createdAt: "2025-08-04",
    likeCount: 24,
    replies: []
  },
  {
    id: "c3",
    author: "只看免费集",
    text: "先把前两集看完，再决定要不要换时长。",
    createdAt: "2025-08-05",
    likeCount: 9,
    replies: [
      {
        id: "c3-r1",
        author: "同担",
        text: "同感，先试看。",
        createdAt: "2025-08-05",
        likeCount: 2
      }
    ]
  },
  {
    id: "c4",
    author: "热评搬运工",
    text: "霸总拍桌子手疼了，终于有个有血有肉的反应。",
    createdAt: "2025-08-06",
    likeCount: 4,
    replies: []
  }
];

export function cloneLocalComments(): LocalComment[] {
  return SAMPLE_COMMENTS.map((comment) => ({
    ...comment,
    replies: comment.replies.map((reply) => ({ ...reply }))
  }));
}

export function countLocalComments(comments: LocalComment[]): number {
  return comments.reduce((total, comment) => total + 1 + comment.replies.length, 0);
}
