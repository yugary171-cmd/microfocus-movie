import {
  ADMIN_WEB_PAGE_SIZE,
  normalizeAdminWebPageSize
} from "@microfocus/contracts";
import type {
  AuditLog,
  PageResult
} from "@/shared/types";




import {
  state
} from "../state";

import {
  mockDelay,
  paginate
} from "../helpers";

export const auditMockApi = {
  async listAuditLogs(query = "", page = 1, pageSize = ADMIN_WEB_PAGE_SIZE): Promise<PageResult<AuditLog>> {
    const normalized = query.trim().toLowerCase();
    const items = state.auditLogs.filter((item) =>
      [item.actorName, item.action, item.target, item.requestId]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
    return mockDelay(paginate(items, page, normalizeAdminWebPageSize(pageSize)));
  },
};
