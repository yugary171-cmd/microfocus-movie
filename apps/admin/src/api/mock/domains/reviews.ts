import {
  AdminRole,
  ADMIN_WEB_PAGE_SIZE,
  DramaStatus,
  isOwnedContentRole,
  normalizeAdminWebPageSize
} from "@microfocus/contracts";
import type {
  PageResult,
  AdminUser,
  ReviewItem
} from "@/shared/types";




import {
  state
} from "../state";
import {
  persistMockContent
} from "../storage";
import {
  mockDelay,
  paginate,
  writeAudit
} from "../helpers";

export const reviewsMockApi = {
  async listReviews(page = 1, actor?: AdminUser | null, pageSize = ADMIN_WEB_PAGE_SIZE): Promise<PageResult<ReviewItem>> {
    const pending = state.reviews.filter(
      (item) =>
        item.status === "PENDING" &&
        (!actor || actor.role === AdminRole.ADMIN || item.submitterId === actor.id),
    );
    return mockDelay(paginate(pending, page, normalizeAdminWebPageSize(pageSize)));
  },
  async review(id: string, approved: boolean, reason: string, actor?: AdminUser | null): Promise<void> {
    const review = state.reviews.find((item) => item.id === id);
    if (!review) throw new Error("未找到审核任务");
    if (actor && isOwnedContentRole(actor.role) && review.submitterId !== actor.id) {
      throw new Error("只能审核本人负责的剧目");
    }
    review.status = approved ? "APPROVED" : "REJECTED";
    const drama = state.dramas.find((item) => item.id === review.dramaId);
    if (drama) {
      drama.status = approved ? DramaStatus.READY : DramaStatus.DRAFT;
      drama.contentApproved = approved;
      drama.copyrightVerified = approved;
      drama.wechatApproved = approved;
    }
    writeAudit(state, approved ? "审核通过" : "审核拒绝", review.dramaTitle, reason || "未填写补充说明");
    persistMockContent(state);
    return mockDelay(undefined);
  },
};
