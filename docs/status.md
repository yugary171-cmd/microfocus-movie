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
- 外部构建还受配置链路约束：内部 Mock 构建允许空 API 地址并注入 Demo 媒体；外部包必须 `MICROFOCUS_CLIENT_MODE=live` 且公开 HTTPS API 地址合法，产物不得含 Demo 媒体。真实 Live provider 和发布证据仍未完成。边界见 [configuration.md](./configuration.md)。
- 2026-08-14 当前工作区执行 `npm run check` 通过；该结果覆盖 typecheck、单元/组件测试和构建，不等于 HTTP E2E、真实 MySQL 并发、真机或真实 provider 验收。
- 产品证据仍停留在内部方案：无用户行为、无内容供给承诺、无类目/广告批复。

### 实现矩阵

| 领域 | 当前已实现 | 部分实现或仅目标设计 |
| --- | --- | --- |
| 身份 | 微信 `code2session` 适配边界、用户 JWT、管理员密码/JWT/TOTP、匿名 viewer token（仅免费集租约）；注销申请将账户标为 `DELETION_PENDING` 并立即撤权；注销需新的微信 `code` 且 live 下 openId 必须与账号一致；微信登录 `code` 最长 256，管理员登录限制邮箱/密码/OTP 长度，匿名 device/session 最长 128；微信登录按连接 IP 限频，匿名新建会话按连接 IP 限频，注销新建申请按认证用户限频，注销进度查询按连接 IP 限频且成功查询另有 1 秒冷却，管理员登录按 IP+邮箱限频；管理端写操作和只读 GET 分别按认证管理员身份限频 | 可删除数据清理依赖未批准的保留矩阵 |
| 内容管理 | 剧目/剧集、权利版本、媒体版本、审核、发布/下架和基础审计；EDITOR 仅访问/修改本人剧目；ADMIN 不兼任编辑或媒体审核；审计日志仅 ADMIN，写入时保存 HTTP `requestId` 并支持按该字段检索；权利到期任务将无覆盖权利的已发布剧目自动下架并撤销活动租约；创建/修改剧目与权利版本限制标题、简介、标签、集数和权利字段长度 | 真实 VOD 发布链路未实现 |
| 奖励与权益 | challenge、基础回调占用、grant、FEFO debit、24 小时过期；创建 challenge 按认证用户限频（5 分钟 3 次），完成按认证用户限频；`dramaId`/`sessionId`/`nonce` 限长；权益摘要按认证用户限频；人工补偿要求 `Idempotency-Key` 且 `compensationKey` 唯一，秒数 60–86400、原因 6–300 字；ADMIN 可通过 `FREEZE_REMAINDER` / `RELEASE_FREEZE` / `WRITE_OFF` 追加纠错事实（秒数上限同为 86400）；过期 challenge 可在 2 小时延迟窗内凭 provider `completedAt` 迁为 `COMPLETED_LATE` 并只发唯一 grant；后台任务按 grant/debit/冻结事实重建余额，差异打开 `PROVIDER:LEDGER` | 可信广告验证未接真实平台 |
| 播放 | 单活租约、短凭证、心跳序列去重、FEFO 扣减、暂停/缓冲不扣费；锁定集 5 秒 reservation、未确认暴露上限、活动租约查询与宽限恢复；恢复需新的微信 `code`；签发新租约、心跳、续签、恢复、关闭、活动租约查询和进度写入按认证主体限频；租约/心跳/进度的 ID、设备、seq 和媒体位置有长度或数值上限；无真实 VOD 交付日志时 UNCONFIRMED 只释放不扣费，心跳也不会对未确认窗口结算 | 真实 VOD 交付日志仍未接入 |
| 回调 | VOD/奖励回调入口、生产验签、事件 ID 去重、处理租约、`RETRYABLE_FAILURE`/`DEAD_LETTER` 状态；ADMIN 可通过 `GET /v1/admin/callback-events` 查看积压元数据，并通过 `POST .../replay` 受审计解锁；ACK 前持久化 AES-256-GCM 规范化载荷（30 天保留），重放可执行该载荷；保留期后清除密文；死信打开对应 `PROVIDER:VOD`/`PROVIDER:WECHAT` 熔断并计入工作台积压；验签前按连接 IP 限频；回调 `eventId`/`fileId`/`challengeId` 限长 | 死信不自动打开 GLOBAL 熔断；过期或缺失载荷仍需 provider 再投递 |
| 客户端 | 管理端和两套观看端的 Mock 主路径、uni-app 平台适配层；Live API URL 注入与外部构建 Demo 媒体扫描；观看端匿名 viewer 会话；登录后播放先查活动租约并可宽限恢复；「我的」可申请注销并查询进度；ADMIN 可在客服核验后补发注销查询令牌；目录、剧目详情和搜索按连接 IP 限频；搜索最多 100 页；首页 latest 按发布时间独立查询；观看历史按认证用户限频；注销进度查询按连接 IP 限频 | 完整法定清理尚未实现 |
| 配置与发布 | 环境 schema、Mock/Live 一致性、生产安全拒启、发布闸门、客户端 Live 构建 URL/Demo 闸门；TOTP 加密密钥双密钥窗口与 `totp:reencrypt` 重加密/回滚；`/health/live` 与 `/health/ready` 分离，关闭时进入排水；HTTP 访问写结构化日志（`requestId`/模块/错误码/耗时/脱敏 actor）；熔断行保存 `updatedBy`（管理员或 `system:*`）；管理端只读 GET 按认证管理员限频；生产不挂载 OpenAPI/Swagger；JSON/urlencoded 请求体 64kb | Live provider 和真实发布证据尚未完成 |

## 下一步（Now）

工程（不加功能）：

1. 真实 Live provider（VOD 签名与激励广告 SSV）仍未实现，保持 fail-closed；不能只改环境变量冒充外部可用。
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

- 2026-08-14：剩余写接口补字符串/数值上限：微信 `code`、管理员邮箱/密码/OTP、租约设备与剧集 ID、心跳 seq/媒体位置、观看进度、奖励 session/nonce、回调 event/file/challenge ID。JSON/urlencoded 请求体显式限制 64kb，并保留 rawBody 供回调验签。不把灰度指标写成已接入。
- 2026-08-14：管理端补偿写入由服务端校验：秒数 60–86400、原因 6–300 字、用户/剧目 ID 限长；纠错秒数上限与补偿共用契约常量。管理端表单不再单独硬编码该范围。不把灰度指标写成已接入。
- 2026-08-14：OpenAPI/Swagger 仅在非生产挂载 `/docs`。生产 `NODE_ENV=production` 不生成也不暴露接口文档，避免公开管理端与回调路径。
- 2026-08-14：管理端创建/修改剧目与权利版本限制输入范围：标题 120、简介 2000、标签最多 20 个、集数最多 200、单集时长不超过 3600 秒；权利人/许可证号/材料键同样限长。不把灰度指标写成已接入。
- 2026-08-14：首页 `latest` 按 `publishedAt DESC, id DESC` 独立查询，不再从推荐榜按 ID 重排；`featured/popular` 仍按推荐分。同值以稳定 ID 作次级排序。
- 2026-08-14：公开搜索最多返回前 100 页（每页 20 条）。超过上限直接返回空结果，不执行大 OFFSET 查询。同 rank/发布时间时按稳定 ID 排序。不把灰度指标写成已接入。
- 2026-08-14：注销进度查询在验令牌前按连接 IP 限频（每分钟 30 次），失败猜测也占桶；同一令牌成功查询仍保留 1 秒冷却。不信任 `X-Forwarded-For`。法定清理仍依赖未批准的保留矩阵。
- 2026-08-14：管理端只读 GET 按认证管理员限频（每分钟 60 次），与写操作分桶；键为管理员 ID，不信任客户端字段。CORS 预检 OPTIONS 不占桶。登录仍按 IP+邮箱。不把灰度指标写成已接入。
- 2026-08-14：已认证读路径限频：观看历史每分钟 30 次、权益摘要每分钟 60 次、活动租约查询每分钟 30 次，键为认证用户 ID。不把灰度指标写成已接入。
- 2026-08-14：注销新建申请按认证用户限频（10 分钟 5 次），在微信 `code` 兑换前拦截；同一 `Idempotency-Key` 重放不占桶、不消耗新 code。查询进度另按连接 IP 限频，成功查询仍有令牌 1 秒冷却。法定清理仍依赖未批准的保留矩阵。
- 2026-08-14：播放恢复（每分钟 10 次，在微信 `code` 兑换前）和关闭租约（每分钟 20 次）使用 Prisma `RateLimitBucket`，键为认证用户或匿名 viewer。自动宽限仍受 24 小时次数上限约束。
- 2026-08-14：公开目录 `GET /v1/catalog` 与剧目详情 `GET /v1/dramas/:id` 按连接 IP 限频（各每分钟 60 次），与搜索分桶，避免用首页或详情绕过搜索限频。不信任 `X-Forwarded-For`。
- 2026-08-14：匿名 viewer 新建会话改用 Prisma `RateLimitBucket`，按连接 IP 限频（10 分钟 10 次），不再只按可伪造的 `deviceId` 计数。同一 device/session 刷新不占桶。
- 2026-08-14：观看进度 `PUT /v1/me/progress` 按认证用户限频（每分钟 60 次），键为 `user:` 前缀，不信任客户端字段。匿名 viewer 不能写服务端进度。
- 2026-08-14：播放心跳（每分钟 60 次）和续签（每分钟 20 次）使用 Prisma `RateLimitBucket`，键为认证用户或匿名 viewer，与租约签发相同，不信任客户端字段。默认 5 秒心跳仍远低于上限。
- 2026-08-14：奖励 challenge 创建与完成改用 Prisma `RateLimitBucket`，键为认证用户 ID（`user:` 前缀），不信任客户端字段。创建仍为每 5 分钟 3 次；完成每分钟 20 次。仍保留同一用户只能有一个 PENDING challenge。
- 2026-08-14：熔断记录保存 `updatedBy`：管理员写操作为管理员 ID，死信/账本对账作业为 `system:dead-letter` / `system:ledger-reconcile`。已打开的熔断不覆盖操作者。GET 不再把该字段写死为空。
- 2026-08-14：管理写操作审计记录关联 HTTP `requestId`（Prisma `AuditLog.requestId`，旧行可空）；列表返回该字段并可检索。不记录请求体或令牌。
- 2026-08-14：管理端写操作按认证管理员 ID 限频（每分钟 40 次），只读 GET 不占用写桶；键不使用可伪造的客户端字段。登录仍单独按 IP+邮箱限频。
- 2026-08-14：HTTP 访问写单行 JSON 结构化日志，含 `requestId`、模块、稳定错误码、耗时和脱敏 actor；去掉查询串，不记录 Authorization、请求体或健康检查。
- 2026-08-14：无真实 VOD 交付日志时，UNCONFIRMED 窗口只能宽限释放，不能自动扣费；心跳遇到未确认窗口返回 `UNCONFIRMED_EXPOSURE` 且 `debitedSeconds=0`。Live VOD 交付证据仍保持 fail-closed。
- 2026-08-14：权益账本周期对账：按 grant、debit、冻结/解冻重建 `remainingSeconds`，并检查已完成 challenge 是否有唯一 grant。`WRITE_OFF` 不参与余额重建。发现差异写入 `LEDGER_RECONCILED` 并打开 `PROVIDER:LEDGER`，不改写原事实；工作台展示最近一次对账。不自动关闭熔断。
- 2026-08-14：登录、匿名新建会话、目录/剧目详情/搜索、播放租约签发/心跳/续签/恢复/关闭/活动查询、观看历史/进度、权益摘要、奖励 challenge 创建/完成、注销新建申请/进度查询、管理端写操作/只读 GET 和 VOD/奖励回调使用 Prisma `RateLimitBucket` 限频；键取连接 `socket.remoteAddress` 或已认证主体，不信任 `X-Forwarded-For`。超限返回 `RATE_LIMITED`。后台任务删除超过 24 小时的桶。
- 2026-08-14：健康检查区分存活 `/health/live` 与就绪 `/health/ready`（`/health` 仍表示就绪）。进程关闭时进入排水，就绪返回 `NOT_READY`，后台任务停止新一轮；不抢其他实例的回调处理租约，未完成回调靠 `processingUntil` 到期后重试。
- 2026-08-14：回调死信打开对应 `PROVIDER:VOD` / `PROVIDER:WECHAT` 熔断，并在管理端工作台展示死信数、可重试失败、最老未处理年龄；不自动打开 GLOBAL。重放后需管理员另行关闭 provider 熔断。
- 2026-08-14：ADMIN 可在客服核验后补发注销查询令牌：`userId` 必须与申请一致，旧令牌立即失效，新令牌只返回一次；不恢复用户 JWT。法定清理仍依赖未批准的保留矩阵。
- 2026-08-14：TOTP 加密密钥轮换：登录可在维护窗口回退 `TOTP_ENCRYPTION_KEY_PREVIOUS`；`npm run totp:reencrypt` 默认 dry-run，`--commit` 重加密，`--rollback --commit` 写回上一密钥。生产种子校验 Base32 并拒绝示例 TOTP secret。回调若仍回退 TOTP 密钥则拒绝轮换。
- 2026-08-14：新增 [ci-pipeline.md](./ci-pipeline.md)，说明 GitHub/Coding + NestJS API + 管理端 + uni-app 体验版的最小 CI/CD 路径（不含微信云开发 Git）。
- 2026-08-14：回调 ACK 前持久化 AES-256-GCM 规范化载荷（可选独立密钥，缺省回退 TOTP 密钥，保留 30 天）。管理员重放在保留期内会执行该载荷；无密钥、过期或历史无密文的事件仍只解锁。
- 2026-08-14：实现晚到奖励：奖励回调在 challenge 已 EXPIRED 时，若 `completedAt` 落在原有效期内且回调仍在 2 小时延迟窗内，则迁为 `COMPLETED_LATE` 并只创建唯一 grant；缺少完成时间不猜测成功。
- 2026-08-14：实现回调死信与审计重放：重试耗尽进入 `DEAD_LETTER` 且不可被普通 reclaim；`POST /v1/admin/callback-events/:eventId/replay` 将可重放事件迁回 `PROCESSING`。尚未存储加密载荷，也不自动打开 GLOBAL 熔断。
- 2026-08-14：注销申请与播放租约恢复要求一次性微信 `wechatCode`：live 下 `code2session` 的 openId 必须与账号一致；Mock 无法跨 code 稳定绑定同一 openId，因此只要求 mock 兑换成功。JWT 不能代替这次证明。幂等重放注销申请不再消耗新的 code。
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
