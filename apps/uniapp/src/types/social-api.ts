import type {
  CommentLikeView,
  CommentView,
  CreateCommentRequest,
  CreateConversationRequest,
  CreateDirectMessageRequest,
  DirectConversationView,
  DirectMessageView,
  DramaLibraryItem,
  FollowUserCard,
  PublicUserProfile,
  SocialPage
} from "@microfocus/contracts";

export interface SocialClientApi {
  getUser(userId: string): Promise<PublicUserProfile>;
  followUser(userId: string): Promise<PublicUserProfile>;
  unfollowUser(userId: string): Promise<PublicUserProfile>;
  getUserFollowers(userId: string, page: number): Promise<SocialPage<FollowUserCard>>;
  getUserFollowing(userId: string, page: number): Promise<SocialPage<FollowUserCard>>;
  getMeFollowers(page: number): Promise<SocialPage<FollowUserCard>>;
  getMeFollowing(page: number): Promise<SocialPage<FollowUserCard>>;
  getFavorites(page: number): Promise<SocialPage<DramaLibraryItem>>;
  putFavorite(dramaId: string): Promise<{ dramaId: string }>;
  deleteFavorite(dramaId: string): Promise<{ dramaId: string }>;
  getLikedDramas(page: number): Promise<SocialPage<DramaLibraryItem>>;
  putLikedDrama(dramaId: string): Promise<{ dramaId: string }>;
  deleteLikedDrama(dramaId: string): Promise<{ dramaId: string }>;
  getDramaComments(dramaId: string, page: number): Promise<SocialPage<CommentView>>;
  createDramaComment(dramaId: string, input: CreateCommentRequest): Promise<CommentView>;
  getUserWall(userId: string, page: number): Promise<SocialPage<CommentView>>;
  createWallComment(userId: string, input: CreateCommentRequest): Promise<CommentView>;
  getCommentReplies(commentId: string, page: number): Promise<SocialPage<CommentView>>;
  deleteComment(commentId: string): Promise<{ id: string }>;
  likeComment(commentId: string): Promise<{ commentId: string }>;
  unlikeComment(commentId: string): Promise<{ commentId: string }>;
  getMeComments(page: number): Promise<SocialPage<CommentView>>;
  getMeCommentInbox(page: number): Promise<SocialPage<CommentView>>;
  getMeReceivedCommentLikes(page: number): Promise<SocialPage<CommentLikeView>>;
  getConversations(page: number): Promise<SocialPage<DirectConversationView>>;
  createConversation(input: CreateConversationRequest): Promise<DirectConversationView>;
  getConversationMessages(conversationId: string, page: number): Promise<SocialPage<DirectMessageView>>;
  sendConversationMessage(
    conversationId: string,
    input: CreateDirectMessageRequest
  ): Promise<DirectMessageView>;
  markConversationRead(conversationId: string): Promise<{ conversationId: string; readAt: string }>;
}

export function emptySocialPage<T>(page: number): SocialPage<T> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  return { items: [], page: safePage, hasMore: false };
}
