import {
  ERROR_CODES,
  SOCIAL_LIST_PAGE_SIZE,
  type CommentView,
  type PublicUserProfile
} from "@microfocus/contracts";
import { requireMockProfile } from "./profile-state";
import {
  deleteMockLibraryCards,
  getMockFavoriteCards,
  getMockLikeCards,
  upsertMockLibraryCard
} from "./history-state";
import { historyCardToLibraryItem } from "../utils/history-view";
import type { SocialClientApi } from "../types/social-api";
import { emptySocialPage } from "../types/social-api";
import { FAVORITE_TAB, LIKE_TAB } from "../utils/inbox-view";

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { items: slice, page: safePage, hasMore: start + slice.length < items.length };
}

function mockPublicUser(followedByMe = false): PublicUserProfile {
  const user = requireMockProfile();
  return {
    ...user,
    followerCount: 0,
    followingCount: 0,
    receivedCommentLikeCount: 0,
    followedByMe
  };
}

type MockComment = CommentView;

const commentsByDrama = new Map<string, MockComment[]>();

function ensureDramaComments(dramaId: string): MockComment[] {
  const existing = commentsByDrama.get(dramaId);
  if (existing) return existing;
  const seeded: MockComment[] = [];
  commentsByDrama.set(dramaId, seeded);
  return seeded;
}

function allComments(): MockComment[] {
  return [...commentsByDrama.values()].flat();
}

function commentsForUser(predicate: (row: MockComment, userId: string) => boolean): MockComment[] {
  const user = requireMockProfile();
  return allComments()
    .filter((row) => predicate(row, user.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

function pageList<T>(rows: T[], page: number) {
  return paginateItems(rows, page, SOCIAL_LIST_PAGE_SIZE);
}

export function createMockSocialApi(): SocialClientApi {
  return {
    getUser: () => delay(mockPublicUser()),
    followUser: () => delay(mockPublicUser(true)),
    unfollowUser: () => delay(mockPublicUser(false)),
    getUserFollowers: (_userId, page) => delay(emptySocialPage(page)),
    getUserFollowing: (_userId, page) => delay(emptySocialPage(page)),
    getMeFollowers: (page) => delay(emptySocialPage(page)),
    getMeFollowing: (page) => delay(emptySocialPage(page)),
    getFavorites: (page) => delay(pageList(getMockFavoriteCards().map(historyCardToLibraryItem), page)),
    putFavorite: (dramaId) => {
      upsertMockLibraryCard(FAVORITE_TAB, dramaId);
      return delay({ dramaId });
    },
    deleteFavorite: (dramaId) => {
      deleteMockLibraryCards(FAVORITE_TAB, [dramaId]);
      return delay({ dramaId });
    },
    getLikedDramas: (page) => delay(pageList(getMockLikeCards().map(historyCardToLibraryItem), page)),
    putLikedDrama: (dramaId) => {
      upsertMockLibraryCard(LIKE_TAB, dramaId);
      return delay({ dramaId });
    },
    deleteLikedDrama: (dramaId) => {
      deleteMockLibraryCards(LIKE_TAB, [dramaId]);
      return delay({ dramaId });
    },
    getDramaComments: (dramaId, page) => {
      const roots = ensureDramaComments(dramaId).filter((row) => !row.parentCommentId);
      return delay(pageList(roots, page));
    },
    createDramaComment: (dramaId, input) => {
      const body = input.body.trim();
      const user = requireMockProfile();
      const rows = ensureDramaComments(dramaId);
      const parent = input.parentCommentId ? rows.find((row) => row.id === input.parentCommentId) : undefined;
      const created: MockComment = {
        id: `local-${Date.now()}`,
        author: { ...user },
        targetType: "DRAMA",
        dramaId,
        targetUserId: null,
        episodeId: input.episodeId ?? null,
        parentCommentId: input.parentCommentId ?? null,
        replyToUserId: parent?.author.id ?? null,
        body,
        likeCount: 0,
        likedByMe: false,
        replyCount: 0,
        status: "VISIBLE",
        createdAt: new Date().toISOString()
      };
      rows.unshift(created);
      if (parent) parent.replyCount += 1;
      return delay(created);
    },
    getUserWall: (_userId, page) => delay(emptySocialPage(page)),
    createWallComment: () => Promise.reject(new Error("内部体验尚未接入用户墙")),
    getCommentReplies: (commentId, page) => {
      for (const rows of commentsByDrama.values()) {
        const parent = rows.find((row) => row.id === commentId);
        if (!parent) continue;
        const replies = rows.filter((row) => row.parentCommentId === commentId);
        return delay(pageList(replies, page));
      }
      return delay(emptySocialPage(page));
    },
    deleteComment: (id) => delay({ id }),
    likeComment: (commentId) => {
      for (const rows of commentsByDrama.values()) {
        const comment = rows.find((row) => row.id === commentId);
        if (comment && !comment.likedByMe) {
          comment.likedByMe = true;
          comment.likeCount += 1;
        }
      }
      return delay({ commentId });
    },
    unlikeComment: (commentId) => {
      for (const rows of commentsByDrama.values()) {
        const comment = rows.find((row) => row.id === commentId);
        if (comment?.likedByMe) {
          comment.likedByMe = false;
          comment.likeCount = Math.max(0, comment.likeCount - 1);
        }
      }
      return delay({ commentId });
    },
    getMeComments: (page) =>
      delay(pageList(commentsForUser((row, userId) => row.author.id === userId), page)),
    getMeCommentInbox: (page) =>
      delay(
        pageList(
          commentsForUser(
            (row, userId) =>
              row.author.id !== userId && (row.targetUserId === userId || row.replyToUserId === userId)
          ),
          page
        )
      ),
    getMeReceivedCommentLikes: (page) => delay(emptySocialPage(page)),
    getConversations: (page) => delay(emptySocialPage(page)),
    createConversation: () =>
      Promise.reject(Object.assign(new Error("需要先关注对方"), { code: ERROR_CODES.FOLLOW_REQUIRED })),
    getConversationMessages: (_conversationId, page) => delay(emptySocialPage(page)),
    sendConversationMessage: () =>
      Promise.reject(Object.assign(new Error("需要先关注对方"), { code: ERROR_CODES.FOLLOW_REQUIRED })),
    markConversationRead: (conversationId) =>
      delay({ conversationId, readAt: new Date().toISOString() })
  };
}
