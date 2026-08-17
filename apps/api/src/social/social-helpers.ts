import {
  ERROR_CODES,
  SOCIAL_LIST_MAX_PAGE,
  SOCIAL_LIST_PAGE_SIZE,
  type PublicUserProfile,
  type SocialPage
} from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { boundedListWindow, emptyBoundedPage, parsePage } from "../common/list-pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toProfile } from "../profile/profile.module.js";
import { assertNamedRateLimit, requestIpKey, type SocketRequest } from "../security/rate-limit.js";
import type { Principal } from "../security/security.js";

export const publicUserSelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
  signature: true,
  gender: true,
  status: true,
  followerCount: true,
  followingCount: true,
  receivedCommentLikeCount: true
} as const;

export type PublicUserRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  signature: string;
  gender: string;
  status: string;
  followerCount: number;
  followingCount: number;
  receivedCommentLikeCount: number;
};

export function optionalUserId(principal?: Principal): string | undefined {
  return principal?.kind === "user" ? principal.sub : undefined;
}

export async function assertSocialReadLimit(
  prisma: PrismaService,
  principal: Principal | undefined,
  request: SocketRequest
): Promise<void> {
  const userId = optionalUserId(principal);
  await assertNamedRateLimit(prisma, "socialRead", userId ? `user:${userId}` : requestIpKey(request));
}

export async function assertSocialWriteLimit(prisma: PrismaService, userId: string): Promise<void> {
  await assertNamedRateLimit(prisma, "socialWrite", `user:${userId}`);
}

export async function assertSocialMessageWriteLimit(prisma: PrismaService, userId: string): Promise<void> {
  await assertNamedRateLimit(prisma, "socialMessageWrite", `user:${userId}`);
}

export function socialPageWindow(pageValue = "1"): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  exceeded: boolean;
} {
  return boundedListWindow({
    page: parsePage(pageValue),
    pageSize: SOCIAL_LIST_PAGE_SIZE,
    maxPage: SOCIAL_LIST_MAX_PAGE
  });
}

export function emptySocialPage<T>(page: number): SocialPage<T> {
  const empty = emptyBoundedPage(page, SOCIAL_LIST_PAGE_SIZE);
  return { items: empty.items as T[], page: empty.page, hasMore: false };
}

export function toSocialPage<T>(items: T[], page: number, total: number, pageSize: number): SocialPage<T> {
  return {
    items,
    page,
    hasMore: page * pageSize < total && page < SOCIAL_LIST_MAX_PAGE
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function toPublicUser(user: PublicUserRow, followedByMe: boolean): PublicUserProfile {
  return {
    ...toProfile(user),
    followerCount: Math.max(0, user.followerCount),
    followingCount: Math.max(0, user.followingCount),
    receivedCommentLikeCount: Math.max(0, user.receivedCommentLikeCount),
    followedByMe
  };
}

export async function requireActivePublicUser(
  prisma: PrismaService,
  userId: string
): Promise<PublicUserRow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect
  });
  if (!user || user.status !== "ACTIVE") throw Errors.notFound("User");
  return user;
}

export async function followedByViewer(
  prisma: PrismaService,
  viewerId: string | undefined,
  followeeIds: string[]
): Promise<Set<string>> {
  if (!viewerId || !followeeIds.length) return new Set();
  const rows = await prisma.userFollow.findMany({
    where: { followerId: viewerId, followeeId: { in: followeeIds } },
    select: { followeeId: true }
  });
  return new Set(rows.map((row) => row.followeeId));
}

export async function requireFollows(
  prisma: PrismaService,
  followerId: string,
  followeeId: string
): Promise<void> {
  const follow = await prisma.userFollow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId } },
    select: { id: true }
  });
  if (!follow) {
    throw Errors.forbidden(ERROR_CODES.FOLLOW_REQUIRED, "Follow the user before sending a message");
  }
}

export function conversationPair(userId: string, peerUserId: string): { userLowId: string; userHighId: string } {
  return userId < peerUserId
    ? { userLowId: userId, userHighId: peerUserId }
    : { userLowId: peerUserId, userHighId: userId };
}

export function conversationPeerId(
  conversation: { userLowId: string; userHighId: string },
  userId: string
): string {
  return conversation.userLowId === userId ? conversation.userHighId : conversation.userLowId;
}
