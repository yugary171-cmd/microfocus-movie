# 项目状态

- 更新日期：2026-08-14
- 本文是实现进度的唯一说明；PRD、架构和 API 文档描述目标规则，不代表代码已经具备全部能力

## 当前目标

按 [product-plan.md](./product-plan.md) 执行两轨工作：把已实现的三端收口为可内部联调的合规管道；并行盘点内容权利与权益理解，而不是按对外上线蓝图继续加功能。

首版产品形态：Vue 3 uni-app 观看端（微信对齐优先）、Vue 3 PC 管理后台、NestJS/MySQL 服务端、微信/VOD 适配边界和完整权益账本。原生小程序仅作过渡对照。默认规则仍是前 2 集免费、一次广告 600 秒、24 小时过期、按剧 FEFO；这些是 v0 默认值，不是已验证的增长策略。

## 当前状态

- PRD、架构、页面/API、配置、运维和发布清单已形成目标设计，但部分目标接口、模型和安全控制尚未实现。
- `packages/contracts` 目前只覆盖现有 `/v1` 子集；[pages-and-apis.md](./pages-and-apis.md) 同时包含后续目标契约，不能据此推断路由已经存在。
- API、管理后台、uni-app 和原生过渡小程序已形成首轮内部 Mock 实现。2026-08-14 已将当时工作区收成 Git 快照 `17babc1`（不含 `.env`、本机 Demo origin、微信私有配置和 `旧内容/`）。
- 当前仅允许 Mock 内部体验；真实外部发布仍受资质、备案、微信类目、广告能力和逐剧内容权利闸门约束。
- 微信 `code2session` 登录适配已实现；腾讯云 VOD 上传/播放签名和微信激励广告可信服务端验证仍为 fail-closed。发布闸门会返回 `LIVE_PROVIDER_IMPLEMENTATION_REQUIRED`，生产进程也会拒绝启动，直到企业账号完成真实实现与端到端验收。
- 外部构建还受配置链路约束：内部 Mock 构建允许空 API 地址并注入 Demo 媒体；外部包必须 `MICROFOCUS_CLIENT_MODE=live` 且公开 HTTPS API 地址合法，产物不得含 Demo 媒体。真实 Live provider、TOTP 轮换和发布证据仍未完成。边界见 [configuration.md](./configuration.md)。
- 2026-08-14 当前工作区执行 `npm run check` 通过；该结果覆盖 typecheck、单元/组件测试和构建，不等于 HTTP E2E、真实 MySQL 并发、真机或真实 provider 验收。
- 产品证据仍停留在内部方案：无用户行为、无内容供给承诺、无类目/广告批复。

### 实现矩阵

| 领域 | 当前已实现 | 部分实现或仅目标设计 |
| --- | --- | --- |
| 身份 | 微信 `code2session` 适配边界、用户 JWT、管理员密码/JWT/TOTP、匿名 viewer token（仅免费集租约）；注销申请将账户标为 `DELETION_PENDING` 并立即撤权 | 尚无「近期重新认证证明」；可删除数据清理依赖未批准的保留矩阵 |
| 内容管理 | 剧目/剧集、权利版本、媒体版本、审核、发布/下架和基础审计；EDITOR 仅访问/修改本人剧目；ADMIN 不兼任编辑或媒体审核；审计日志仅 ADMIN | 真实 VOD 发布链路未实现 |
| 奖励与权益 | challenge、基础回调占用、grant、FEFO debit、24 小时过期；人工补偿要求 `Idempotency-Key` 且 `compensationKey` 唯一；ADMIN 可通过 `FREEZE_REMAINDER` / `RELEASE_FREEZE` / `WRITE_OFF` 追加纠错事实；过期 challenge 可在 2 小时延迟窗内凭 provider `completedAt` 迁为 `COMPLETED_LATE` 并只发唯一 grant | 可信广告验证未接真实平台 |
| 播放 | 单活租约、短凭证、心跳序列去重、FEFO 扣减、暂停/缓冲不扣费；锁定集 5 秒 reservation、未确认暴露上限、活动租约查询与宽限恢复 | 无真实 VOD 交付日志时 UNCONFIRMED 不自动扣费；恢复尚无「近期重新认证证明」 |
| 回调 | VOD/奖励回调入口、生产验签、事件 ID 去重、处理租约、`RETRYABLE_FAILURE`/`DEAD_LETTER` 状态；ADMIN 可通过 `POST /v1/admin/callback-events/:eventId/replay` 受审计解锁；ACK 前持久化 AES-256-GCM 规范化载荷（30 天保留），重放可执行该载荷 | 死信不自动打开 GLOBAL 熔断；过期或缺失载荷仍需 provider 再投递 |
| 客户端 | 管理端和两套观看端的 Mock 主路径、uni-app 平台适配层；Live API URL 注入与外部构建 Demo 媒体扫描；观看端匿名 viewer 会话；登录后播放先查活动租约并可宽限恢复；「我的」可申请注销并查询进度 | 完整法定清理与客服令牌恢复尚未实现 |
| 配置与发布 | 环境 schema、Mock/Live 一致性、生产安全拒启、发布闸门、客户端 Live 构建 URL/Demo 闸门 | Live provider、TOTP 安全轮换和真实发布证据尚未完成 |

## 下一步（Now）

工程（不加功能）：

1. 工程回调列的加密载荷已落地；下一项按矩阵为 Live provider 实现与「近期重新认证证明」，先更新 `packages/contracts`，再实现服务端。
2. 不自动推送；后续提交需人工确认。

产品（与工程并行）：

1. 确认主体 / 类目 / 成片三项各自是已有、进行中还是没有。
2. 建立 5–10 部候选剧权利盘点（缺项必须写明）。
3. 把 600 秒翻译成「约 N 集 + 过期时间 + 仅本剧」并做 5 人任务测试。

## 需要人工完成或复核

- 提供真实微信、腾讯云、域名和部署环境，但不要通过聊天或 Git 传递秘密。
- 外部灰度前完成 `docs/release-checklist.md` 的“灰度启动前”硬闸门；500 人、14 天、D7 和贡献毛利属于灰度运行期的未校准目标与停止护栏，不能作为启动前条件。
- 由后续实施人员按届时有效的腾讯 VOD 与微信广告官方能力完成 provider adapter；不能只把环境变量改成 `live`。
- 内容授权与类目路径由人工推进；工程收口不能替代这项工作。
- 外部灰度前由产品、法务/隐私和工程共同冻结数据保留矩阵；在期限和法律依据未确认前不创建伪精确规则。

## 历史

- 2026-08-14：新增 [ci-pipeline.md](./ci-pipeline.md)，说明 GitHub/Coding + NestJS API + 管理端 + uni-app 体验版的最小 CI/CD 路径（不含微信云开发 Git）。
- 2026-08-14：回调 ACK 前持久化 AES-256-GCM 规范化载荷（可选独立密钥，缺省回退 TOTP 密钥，保留 30 天）。管理员重放在保留期内会执行该载荷；无密钥、过期或历史无密文的事件仍只解锁。
- 2026-08-14：实现晚到奖励：奖励回调在 challenge 已 EXPIRED 时，若 `completedAt` 落在原有效期内且回调仍在 2 小时延迟窗内，则迁为 `COMPLETED_LATE` 并只创建唯一 grant；缺少完成时间不猜测成功。
- 2026-08-14：实现回调死信与审计重放：重试耗尽进入 `DEAD_LETTER` 且不可被普通 reclaim；`POST /v1/admin/callback-events/:eventId/replay` 将可重放事件迁回 `PROCESSING`。尚未存储加密载荷，也不自动打开 GLOBAL 熔断。
- 2026-08-14：实现账号注销申请：`POST /v1/me/deletion-requests` 在事务内标记 `DELETION_PENDING`、撤销租约并阻止新奖励；旧 JWT 立即失效；`GET` 仅用查询令牌摘要核验。尚未做保留矩阵清理与重新认证证明。
- 2026-08-14：实现权益 adjustment：`POST /v1/admin/entitlements/adjustments` 以幂等键追加冻结、释放冻结或核销；禁止改原 grant/debit，核销不改用户余额。
- 2026-08-14：实现锁定集播放 reservation：签发前预留 5 秒窗口，心跳确认后转 debit，超时标 UNCONFIRMED；`GET /v1/playback/leases/active` 与 `POST .../recover` 支持活动租约恢复（24 小时内最多 3 次自动宽限）。
- 2026-08-14：实现匿名 viewer token（`POST /v1/auth/anonymous`），仅可申请和维护免费集租约；用户/管理员令牌不可互换。
- 2026-08-14：本地 Docker MySQL 为 Prisma `migrate dev` 影子库补齐 `CREATE DATABASE` 权限（init 脚本；已有数据卷需一次性 GRANT）。
- 2026-08-14：新增 [deployment.md](./deployment.md)，集中说明数据库、API 托管与各端共用关系。
- 2026-08-14：收紧管理端角色/所有权，并为人工补偿增加 `Idempotency-Key` 与 `EntitlementGrant.compensationKey` 唯一约束。
- 2026-08-14：Git 快照 `17babc1` 收录 uni-app、文档口径和内部 Mock 管道。
- 2026-08-14：新增发给甲方的封面说明 [client-brief.md](./client-brief.md)；对外材料以目标规格和上线门槛为主，不以工程进度原文作为交付包。
- 2026-08-14：修复了 `ADMIN_BOOTSTRAP_TOTP_SECRET` 的 Schema 遗漏、开发环境 Mock/Live 混用拦截以及管理端 Mock 闸门标识脱节问题。
- 2026-08-14：完成核心目标文档首轮重构，并补充工程规范；后续审计将目标设计与当前实现重新分离。
- 2026-08-13：修复微信真机播放黑屏：将两支本地试播视频统一转码为 H.264 Constrained Baseline + AAC-LC，并增加 `npm run normalize:demo-videos` 复用脚本。
- 2026-08-13：观看端图标改为本地 `static/icons`，检索入口固定为 [iconfont 搜索页](https://www.iconfont.cn/search/index?searchType=icon&page=1&fromCollection=-1)；剧场右侧为圆角星/评论气泡/爱心/分享。
- 2026-08-13：整理观看端/管理端页面与 `/v1` 接口对照，写入 [pages-and-apis.md](./pages-and-apis.md)。
- 2026-08-13：Mock 试播改为监听局域网并在 uni-app 编译时写入本机 IPv4，供微信真机调试；生产播放仍走点播租约 HTTPS。
- 2026-08-13：新建 `apps/uniapp`（Vue 3），用 platform 适配层替换 `wx.*`；微信端继续走 `/v1/auth/wechat` 与激励 `isEnded`；H5/App 明确不复用这两项。原生 `apps/miniprogram` 标为过渡。
- 2026-08-13：将开发计划从「交付可上线首版」收窄为「内部收口 + 内容/权益验证」。见 `docs/product-plan.md`。
- 2026-08-12：完成原产品计划并开始首版工程实现。
