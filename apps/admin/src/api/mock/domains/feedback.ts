import {
  UserFeedbackStatus
} from "@microfocus/contracts";
import type {
  PageResult,
  AdminFeedbackRecord,
  FeedbackStatus
} from "@/shared/types";



import {
  MOCK_CURRENT_ADMIN_ID
} from "../fixtures";
import {
  state
} from "../state";

import {
  mockDelay,
  paginate,
  writeAudit
} from "../helpers";

export const feedbackMockApi = {
  async listFeedback(query = "", status = "", page = 1): Promise<PageResult<AdminFeedbackRecord>> {
    const normalized = query.trim().toLowerCase();
    const items = state.mockFeedback.filter((item) => (!status || item.status === status) && (!normalized || `${item.userId} ${item.userName} ${item.body}`.toLowerCase().includes(normalized)));
    return mockDelay(paginate(items, page));
  },
  async getFeedback(id: string): Promise<AdminFeedbackRecord> {
    const item = state.mockFeedback.find((row) => row.id === id);
    if (!item) throw new Error("未找到反馈");
    return mockDelay(item);
  },
  async updateFeedback(id: string, input: { status?: FeedbackStatus; internalNote?: string }): Promise<AdminFeedbackRecord> {
    const item = state.mockFeedback.find((row) => row.id === id);
    if (!item) throw new Error("未找到反馈");
    if (input.status) item.status = input.status;
    if (input.internalNote !== undefined) item.internalNote = input.internalNote;
    item.handledByAdminId = MOCK_CURRENT_ADMIN_ID;
    item.updatedAt = new Date().toISOString();
    writeAudit(state, "FEEDBACK_STATUS_CHANGED", item.id, item.status);
    return mockDelay(item);
  },
  async replyFeedback(id: string, body: string): Promise<void> {
    const item = state.mockFeedback.find((row) => row.id === id);
    if (!item) throw new Error("未找到反馈");
    item.replies.push({ id: crypto.randomUUID(), body: body.trim(), createdAt: new Date().toISOString() });
    item.status = UserFeedbackStatus.PROCESSING;
    item.updatedAt = new Date().toISOString();
    writeAudit(state, "FEEDBACK_REPLIED", item.id, "已发送管理员回复");
    await mockDelay(undefined);
  },
};
