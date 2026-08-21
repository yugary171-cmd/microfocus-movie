import { getApi } from "./api";
import {
  applyInboxLatest,
  cloneInboxItems,
  type InboxItemView
} from "../utils/inbox-view";

export async function loadInboxItems(): Promise<InboxItemView[]> {
  const social = getApi().social;
  const [followers, comments, mine, likes, notifications] = await Promise.all([
    social.getMeFollowers(1),
    social.getMeCommentInbox(1),
    social.getMeComments(1),
    social.getMeReceivedCommentLikes(1),
    getApi().getNotifications(1)
  ]);
  const fan = Array.isArray(followers?.items) ? followers.items[0] : undefined;
  const comment = Array.isArray(comments?.items) ? comments.items[0] : undefined;
  const myComment = Array.isArray(mine?.items) ? mine.items[0] : undefined;
  const like = Array.isArray(likes?.items) ? likes.items[0] : undefined;
  const latest: Parameters<typeof applyInboxLatest>[1] = {};
  const notification = notifications?.items?.[0];
  if (notification) {
    latest.systemPreview = notification.title;
    latest.systemAt = notification.createdAt;
    latest.systemUnread = (notifications.unreadCount ?? 0) > 0;
  }
  if (fan?.user.displayName) {
    latest.fansName = fan.user.displayName;
    if (fan.followedAt) latest.fansAt = fan.followedAt;
  }
  if (comment?.body) {
    latest.commentPreview = `${comment.author.displayName}：${comment.body}`;
    if (comment.createdAt) latest.commentAt = comment.createdAt;
  }
  if (myComment?.body) {
    latest.minePreview = myComment.body;
    if (myComment.createdAt) latest.mineAt = myComment.createdAt;
  }
  if (like?.actor.displayName) {
    latest.likeName = like.actor.displayName;
    if (like.createdAt) latest.likeAt = like.createdAt;
  }
  return applyInboxLatest(cloneInboxItems(), latest);
}
