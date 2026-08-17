import { API_ROUTES, encodedRoute } from "../constants/routes";
import type { SocialClientApi } from "../types/social-api";

type RequestFn = <T>(
  path: string,
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
  query?: Record<string, string | number>
) => Promise<T>;

export function createRealSocialApi(request: RequestFn): SocialClientApi {
  const pageQuery = (page: number) => ({ page });
  return {
    getUser: (userId) => request(encodedRoute(API_ROUTES.user, userId)),
    followUser: (userId) => request(encodedRoute(API_ROUTES.userFollow, userId), "POST"),
    unfollowUser: (userId) => request(encodedRoute(API_ROUTES.userFollow, userId), "DELETE"),
    getUserFollowers: (userId, page) =>
      request(encodedRoute(API_ROUTES.userFollowers, userId), "GET", undefined, pageQuery(page)),
    getUserFollowing: (userId, page) =>
      request(encodedRoute(API_ROUTES.userFollowing, userId), "GET", undefined, pageQuery(page)),
    getMeFollowers: (page) => request(API_ROUTES.meFollowers, "GET", undefined, pageQuery(page)),
    getMeFollowing: (page) => request(API_ROUTES.meFollowing, "GET", undefined, pageQuery(page)),
    getFavorites: (page) => request(API_ROUTES.meFavorites, "GET", undefined, pageQuery(page)),
    putFavorite: (dramaId) => request(encodedRoute(API_ROUTES.meFavorite, dramaId), "PUT"),
    deleteFavorite: (dramaId) => request(encodedRoute(API_ROUTES.meFavorite, dramaId), "DELETE"),
    getLikedDramas: (page) => request(API_ROUTES.meLikedDramas, "GET", undefined, pageQuery(page)),
    putLikedDrama: (dramaId) => request(encodedRoute(API_ROUTES.meLikedDrama, dramaId), "PUT"),
    deleteLikedDrama: (dramaId) => request(encodedRoute(API_ROUTES.meLikedDrama, dramaId), "DELETE"),
    getDramaComments: (dramaId, page) =>
      request(encodedRoute(API_ROUTES.dramaComments, dramaId), "GET", undefined, pageQuery(page)),
    createDramaComment: (dramaId, input) =>
      request(encodedRoute(API_ROUTES.dramaComments, dramaId), "POST", input),
    getUserWall: (userId, page) =>
      request(encodedRoute(API_ROUTES.userWall, userId), "GET", undefined, pageQuery(page)),
    createWallComment: (userId, input) =>
      request(encodedRoute(API_ROUTES.userWall, userId), "POST", input),
    getCommentReplies: (commentId, page) =>
      request(encodedRoute(API_ROUTES.commentReplies, commentId), "GET", undefined, pageQuery(page)),
    deleteComment: (commentId) => request(encodedRoute(API_ROUTES.comment, commentId), "DELETE"),
    likeComment: (commentId) => request(encodedRoute(API_ROUTES.commentLikes, commentId), "PUT"),
    unlikeComment: (commentId) => request(encodedRoute(API_ROUTES.commentLikes, commentId), "DELETE"),
    getMeComments: (page) => request(API_ROUTES.meComments, "GET", undefined, pageQuery(page)),
    getMeCommentInbox: (page) => request(API_ROUTES.meCommentInbox, "GET", undefined, pageQuery(page)),
    getMeReceivedCommentLikes: (page) =>
      request(API_ROUTES.meReceivedCommentLikes, "GET", undefined, pageQuery(page)),
    getConversations: (page) => request(API_ROUTES.meConversations, "GET", undefined, pageQuery(page)),
    createConversation: (input) => request(API_ROUTES.meConversations, "POST", input),
    getConversationMessages: (conversationId, page) =>
      request(encodedRoute(API_ROUTES.meConversationMessages, conversationId), "GET", undefined, pageQuery(page)),
    sendConversationMessage: (conversationId, input) =>
      request(encodedRoute(API_ROUTES.meConversationMessages, conversationId), "POST", input),
    markConversationRead: (conversationId) =>
      request(encodedRoute(API_ROUTES.meConversationRead, conversationId), "POST")
  };
}
