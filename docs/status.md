# 项目状态

- 更新日期：2026-08-15
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
- 2026-08-15 当前工作区执行 `npm run check` 通过；该结果覆盖 typecheck、单元/组件测试和构建，不等于 HTTP E2E、真实 MySQL 并发、真机或真实 provider 验收。
- 已有契约常量接到 Mock、表单和测试的收口已扫完；剩余硬编码要么是样例数据，要么没有对应契约，不再发明新规则。
- 产品证据仍停留在内部方案：无用户行为、无内容供给承诺、无类目/广告批复。

### 实现矩阵

| 领域 | 当前已实现 | 部分实现或仅目标设计 |
| --- | --- | --- |
| 身份 | 微信 `code2session` 适配边界、用户 JWT、管理员密码/JWT/TOTP、匿名 viewer token（仅免费集租约，TTL `ANONYMOUS_VIEWER_TTL_SECONDS`）；注销申请将账户标为 `DELETION_PENDING` 并立即撤权；注销需新的微信 `code` 且 live 下 openId 必须与账号一致；微信登录 `code` 最长 256，管理员登录限制邮箱/密码/OTP 长度，管理端登录表单与契约共用邮箱 254、密码 8–128（`PASSWORD_MIN_LENGTH`/`MAX`）；一次性验证码界面仍为 6 位 TOTP（`OTP_INPUT_LENGTH`），服务端 OTP 仍允许 6–8；匿名 device/session 最长 128；路径与查询实体 ID 最长 191；Bearer 令牌最长 4096；注销查询令牌最长 128；`Idempotency-Key` 最长 128；微信登录按连接 IP 限频，匿名新建会话按连接 IP 限频，注销新建申请按认证用户限频，空白或超长 `Idempotency-Key` 在限频前拒绝，注销进度查询按连接 IP 限频且成功查询另有 1 秒冷却，管理员登录按 IP+邮箱限频；管理端写操作和只读 GET 分别按认证管理员身份限频（管理员 ID 写入哈希前最长 `RATE_LIMIT_CLIENT_KEY_MAX_LENGTH`）；限频桶 ID 最长 `RATE_LIMIT_BUCKET_ID_MAX_LENGTH`；注销路径走 `API_ROUTES` | 可删除数据清理依赖未批准的保留矩阵 |
| 内容管理 | 剧目/剧集、权利版本、媒体版本、审核、发布/下架和基础审计；EDITOR 仅访问/修改本人剧目；ADMIN 不兼任编辑或媒体审核；审计日志仅 ADMIN，写入时保存 HTTP `requestId`（最长 `REQUEST_ID_MAX_LENGTH=128`）；权利到期任务将无覆盖权利的已发布剧目自动下架并撤销活动租约；创建/修改剧目与权利版本限制标题、简介、标签、集数和权利字段长度；管理端编辑表单与契约共用这些上限；`recommendationRank` 0–9999（`RECOMMENDATION_RANK_MIN`/`MAX`），live 保存默认 `RECOMMENDATION_RANK_DEFAULT=0`，编辑页不提供该控件；权利地域必须是 `RIGHTS_TERRITORY=CN`，live 保存发送该值，编辑页不提供地域控件；非生产 seed 样例权利同样写入该地域；权利材料 SHA-256 必须是 64 位十六进制（`RIGHTS_MATERIAL_DIGEST_LENGTH`），编辑页 maxlength/pattern 与之共用，seed 样例摘要按该长度生成，管理端 mock/测试夹具同样按该长度生成；下架与熔断原因 6–300 字；剧目列表、审核队列与审计日志每页 50 条、最多 100 页，超页返回空结果且不打大 OFFSET；剧目/审计关键词最长 100（`LIST_QUERY_MAX_LENGTH`），管理端搜索框 maxlength 与之共用，服务端按标题/负责人邮箱或动作/目标/`requestId`/操作人邮箱过滤；审核队列无关键词，只按待审状态分页；内容审核 `notes` 最长 2000（`REVIEW_NOTES_MAX_LENGTH`），退回必填、通过可省略，管理端 maxlength 与之共用；媒体审核 `notes` 仍 6–500，未改成 2000；上传签名 `fileName` 最长 255（`UPLOAD_FILE_NAME_MAX_LENGTH`）且不得含路径分隔符，`size` 1–5×1024³ 字节（`UPLOAD_FILE_SIZE_MAX_BYTES`），`contentType` 仅 mp4/quicktime/webm（空类型回退 `application/octet-stream`），管理端选文件后先拦截；上传签名签发成功写入审计（不含签名 URL）；`AdminController` 路径全部走 `API_ROUTES.admin`（登录仍在 AuthController）；管理端请求路径 ID 经 `encodedRoute`；VOD 回调按媒体/转码/机审维度只允许推进或失败，禁止把已失败维度写回 READY/APPROVED，未知 fileId 不猜测 READY | 真实 VOD 发布链路未实现 |
| 奖励与权益 | challenge、基础回调占用、grant、FEFO debit、24 小时过期；创建 challenge 按认证用户限频（5 分钟 3 次），完成按认证用户限频；`dramaId`/`sessionId`/`nonce` 限长；完成 challenge 的 `Idempotency-Key` 与补偿共用规范化（trim、最长 128），空白或超长在限频前拒绝；权益摘要路径走 `API_ROUTES`，按认证用户限频；人工补偿要求 `Idempotency-Key` 且 `compensationKey` 唯一，秒数 60–86400、原因 6–300 字，管理端表单默认秒数 `REWARD_SECONDS`；ADMIN 纠错与补偿一样在 handler 入口规范化 `Idempotency-Key`，可通过 `FREEZE_REMAINDER` / `RELEASE_FREEZE` / `WRITE_OFF` 追加纠错事实（秒数上限同为 86400，表单默认 `COMPENSATION_SECONDS_MIN`，下限仍为 1）；纠错原因/审批记录写入按 `ADMIN_REASON_MAX_LENGTH` 截断；过期 challenge 可在 2 小时延迟窗内凭 provider `completedAt` 迁为 `COMPLETED_LATE` 并只发唯一 grant；后台任务按 grant/debit/冻结事实重建余额，差异打开 `PROVIDER:LEDGER` | 可信广告验证未接真实平台 |
| 播放 | 单活租约、短凭证（TTL `PLAYBACK_TOKEN_TTL_SECONDS`；Mock 租约 `playbackTokenExpiresAt` 与 Mock VOD JWT 上限共用）；心跳间隔 `HEARTBEAT_INTERVAL_SECONDS`（服务端签发、观看端回退与 Mock 租约共用）；心跳序列去重、FEFO 扣减、暂停/缓冲不扣费；锁定集 reservation 窗口 `PLAYBACK_WINDOW_SECONDS`（与心跳间隔相同）；未确认暴露上限 `UNCONFIRMED_EXPOSURE_LIMIT`、活动租约查询与宽限恢复；恢复需新的微信 `code`；签发新租约、心跳、续签、恢复、关闭、活动租约查询和进度写入按认证主体限频；租约/心跳/进度的 ID、设备、seq 和媒体位置有长度或数值上限；恢复事件 `deviceId`/`reason` 写入按 `DEVICE_ID_MAX_LENGTH`/`ENTITY_ID_MAX_LENGTH` 截断，宽限计数使用同一截断后的设备 ID；心跳 `playbackRate` 0.75–2（`PLAYBACK_RATE_MIN`/`MAX`），结算与两端播放器倍速按钮共用 `clampPlaybackRate`/`PLAYBACK_RATES`；播放租约路径走 `API_ROUTES`；无真实 VOD 交付日志时 UNCONFIRMED 只释放不扣费，心跳也不会对未确认窗口结算 | 真实 VOD 交付日志仍未接入 |
| 回调 | VOD/奖励回调入口、生产验签、事件 ID 去重、处理租约、`RETRYABLE_FAILURE`/`DEAD_LETTER` 状态；入口路径走 `API_ROUTES.callbacks`（provider 专用，观看端/管理端客户端不调用）；ADMIN 可通过 `GET /v1/admin/callback-events` 查看积压元数据，并通过 `POST .../replay` 受审计解锁；列表/重放路径走 `API_ROUTES.admin`；重放 handler 入口规范化 `Idempotency-Key`；重放原因/审批记录写入按 `ADMIN_REASON_MAX_LENGTH` 截断；ACK 前持久化 AES-256-GCM 规范化载荷（30 天保留），重放可执行该载荷；保留期后清除密文；死信打开对应 `PROVIDER:VOD`/`PROVIDER:WECHAT` 熔断并计入工作台积压；验签前按连接 IP 限频；回调 `eventId`/`fileId`/`challengeId` 限长；`x-provider-signature` 最长 256；列表 `take` 默认 50、上限 100，过大 `skip` 返回空结果；VOD 回调非法维度回退记为 `REJECTED` 且不改媒体 | 死信不自动打开 GLOBAL 熔断；过期或缺失载荷仍需 provider 再投递 |
| 客户端 | 管理端和两套观看端的 Mock 主路径、uni-app 平台适配层；Live API URL 注入与外部构建 Demo 媒体扫描；观看端匿名 viewer 会话（Mock `expiresAt` 与契约 `ANONYMOUS_VIEWER_TTL_SECONDS` 共用）；登录后播放先查活动租约并可宽限恢复；「我的」可申请注销并查询进度；ADMIN 可在客服核验后补发注销查询令牌，补发 handler 入口规范化 `Idempotency-Key`；目录、剧目详情和搜索按连接 IP 限频；搜索最多 100 页（`SEARCH_MAX_PAGE`），Mock 搜索每页 `SEARCH_PAGE_SIZE`；管理端剧目/审核队列/审计日志由服务端分页；首页 latest 按发布时间独立查询；观看历史按认证用户限频；注销进度查询按连接 IP 限频；剧目详情、权益、播放租约和注销由服务端走 `API_ROUTES`；两套观看端 HTTP 路径同样走契约，路径 ID 会 URL-encode；管理端路径 ID 同样经 `encodedRoute`；观看端奖励完成/注销申请的 `Idempotency-Key` 经 `boundedIdempotencyKey` 限制在 128 以内；管理端登录表单邮箱/密码 min/maxlength 与契约共用；剧目/审计搜索与运营页实体 ID 输入 maxlength 与契约共用；观看端首页/搜索/分类搜索框 maxlength 与 `LIST_QUERY_MAX_LENGTH` 共用，提交前走 `boundListQuery`；免费集数、心跳周期和离线宽限与契约共用 `FREE_EPISODE_COUNT`/`HEARTBEAT_INTERVAL_SECONDS`/`OFFLINE_GRACE_SECONDS`；Mock 租约状态与会话判断共用 `PlaybackLeaseStatus`；激励广告未看完/无填充/加载失败/验证中/确认失败有可区分可重试文案；「我的」可打开客服与投诉、广告未到账协议页；Mock/剧场分享不写剪贴板；Mock 启动关闭微信转发菜单 | 完整法定清理尚未实现；剧场/福利/社交占位不接正式账本；已发布剧的微信原生分享卡片未做 |
| 配置与发布 | 环境 schema、Mock/Live 一致性、生产安全拒启、发布闸门、客户端 Live 构建 URL/Demo 闸门；TOTP 加密密钥双密钥窗口与 `totp:reencrypt` 重加密/回滚；`/health/live` 与 `/health/ready` 分离，关闭时进入排水；HTTP 访问写结构化日志（`requestId` 最长 `REQUEST_ID_MAX_LENGTH`；path/method/actorKind/module/code/actorId 分别最长 `REQUEST_LOG_PATH_MAX_LENGTH`/`REQUEST_LOG_METHOD_MAX_LENGTH`/`REQUEST_LOG_ACTOR_KIND_MAX_LENGTH`/`REQUEST_LOG_LABEL_MAX_LENGTH`；脱敏 actor；不含查询串）；熔断行保存 `updatedBy`（管理员或 `system:*`，最长 `CIRCUIT_UPDATED_BY_MAX_LENGTH`）；自动打开的 provider 名最长 `CIRCUIT_PROVIDER_NAME_MAX_LENGTH`；管理端只读 GET 按认证管理员限频；生产不挂载 OpenAPI/Swagger；JSON/urlencoded 请求体 `JSON_BODY_LIMIT`（64kb） | Live provider 和真实发布证据尚未完成 |

## 下一步（Now）

工程（不加功能）：

1. 真实 Live provider（VOD 签名与激励广告 SSV）仍未实现，保持 fail-closed；不能只改环境变量冒充外部可用。
2. 不继续发明契约常量或把无关数字硬接到已有常量；内部主路径阻断缺陷才改代码。
3. 不自动推送；后续提交需人工确认。

产品（当前主路径，工程不能替代）：

1. 产品负责人填写内容/合规、工程、数据、任务测试负责人和承诺日期。未分配前不把这些项写成进行中，不进入 Next。
2. 确认主体 / 类目 / 广告位 / 成片各自是已有、进行中还是没有。
3. 建立 5–10 部候选剧权利盘点（授权主体、期限、微信传播、广告变现、转码、物料；缺项必须写明）。
4. 播放器与额度文案已按样片中位时长把 `REWARD_SECONDS` 写成「约 N 集 + 过期时间 + 仅本剧 + 广告未看完不发奖」。广告未看完/无填充/加载失败/验证中/确认失败文案已区分。「我的」已入口到客服与投诉、广告未到账协议页（无电话/邮箱）。Mock/剧场分享不写出可外传文案，Mock 启动关闭微信转发菜单。固定 5 人无提示任务测试仍待人工。已发布剧的微信原生分享卡片仍未做。

## 需要人工完成或复核

- 提供真实微信、腾讯云、域名和部署环境，但不要通过聊天或 Git 传递秘密。
- 外部灰度前完成 `docs/release-checklist.md` 的“灰度启动前”硬闸门；500 人、14 天、D7 和贡献毛利属于灰度运行期的未校准目标与停止护栏，不能作为启动前条件。
- 由后续实施人员按届时有效的腾讯 VOD 与微信广告官方能力完成 provider adapter；不能只把环境变量改成 `live`。
- 内容授权与类目路径由人工推进；工程收口不能替代这项工作。
- 外部灰度前由产品、法务/隐私和工程共同冻结数据保留矩阵；在期限和法律依据未确认前不创建伪精确规则。

## 历史

- 2026-08-15：观看端播放器与剧场不再静音；微信端不跟随系统静音开关。H5 剧场仍静音以允许自动播放。未做真机听感验收。
- 2026-08-15：「我的」增加客服与投诉、广告未到账入口，进入已有协议页，不编造电话或邮箱。Mock/剧场分享不写出可外传文案；Mock 启动时关闭微信右上角转发菜单。不把灰度指标写成已接入。
- 2026-08-15：两套观看端把广告结果分成未看完、无填充、加载失败、验证中和确认失败，文案可区分且可重试；不发奖、已有额度不变。剧场/福利/社交仍不接正式账本。不把灰度指标写成已接入。
- 2026-08-15：本地 Docker MySQL 已执行 `db:migrate:deploy`（无待应用迁移）和 `db:seed`。VOD 回调按媒体/转码/机审维度只允许推进或失败；已失败维度不能写回 READY/APPROVED（事件 `REJECTED`、媒体不变）；未知 fileId 不猜测 READY。管理端 Mock 待审集会用 `PROCESSING` 表示文件处理，审核结论仍走分维度字段。不把灰度指标写成已接入。
- 2026-08-15：观看端把剩余额度写成「约 N 集」，解锁说明使用 `REWARD_SECONDS` 与已发布集中位时长；并展示过期时间、仅本剧、广告未看完不发奖。N 随剩余秒数变化；无集时长时回退到时钟文案。5 人测试仍待人工。不把灰度指标写成已接入。
- 2026-08-15：已有契约常量收口扫描结束。观看历史 `take: 50`、限频/恢复 24 小时窗口、样例集时长和首页 featured 条数不对已有常量，不发明新规则。Now 主路径回到产品负责人分配与内容盘点。不把灰度指标写成已接入。
- 2026-08-15：权利方超长测试改走 `RIGHTS_HOLDER_MAX_LENGTH + 1`，不再写死 `repeat(201)`。DTO 上限已用同一长度。不把灰度指标写成已接入。
- 2026-08-15：回调死信夹具的 `attempts` 改走 `CALLBACK_MAX_ATTEMPTS`，不再写死 `5`。死信判定已用同一上限。不把灰度指标写成已接入。
- 2026-08-15：管理端 live 补偿 `expiresAt` 改走 `REWARD_TTL_SECONDS`，不再写死 `24 * 60 * 60`。服务端奖励 grant 过期已用同一 TTL。不把灰度指标写成已接入。
- 2026-08-15：三端 Mock 注销查询令牌过期时间改走 `DELETION_QUERY_TOKEN_TTL_SECONDS`，不再写死 `30 * 24 * 60 * 60`。服务端签发已用同一 TTL。不把灰度指标写成已接入。
- 2026-08-15：管理端分页窗口测试和回调积压 `take` 改走 `ADMIN_LIST_PAGE_SIZE` / `ADMIN_LIST_MAX_PAGE`，不再写死 `50` / `100`。剧目/审核/审计列表与回调列表实现已用同一套上限。不把灰度指标写成已接入。
- 2026-08-15：奖励/补偿秒数夹具改走 `REWARD_SECONDS`，不再写死 `600`。内存完成样例、对账重建、管理端补偿请求和观看端确认回包共用同一秒数。不把灰度指标写成已接入。
- 2026-08-15：两套观看端 Mock 免费集标记改走 `FREE_EPISODE_COUNT`，不再写死 `index < 2` / `e1|e2`。客户端 `isFreeEpisode` 判定已用同一上限。不把灰度指标写成已接入。
- 2026-08-15：未确认暴露拦截测试的可分配秒数改走 `REWARD_SECONDS`，未确认窗口扣费测试改走 `PLAYBACK_WINDOW_SECONDS`，不再写死 `600` / `5`。签发门槛与窗口预留已用同一套常量。不把灰度指标写成已接入。
- 2026-08-15：两套观看端离线暂停默认宽限改走 `OFFLINE_GRACE_SECONDS`，不再写死 `15`。播放页传入值、默认参数和租约新鲜度测试共用同一秒数。不把灰度指标写成已接入。
- 2026-08-15：恢复动作测试的未确认数量改走 `PLAYBACK_RECOVERY_GRACE_LIMIT - 1`，不再写死 `2`。宽限耗尽判定已用同一上限。不把灰度指标写成已接入。
- 2026-08-15：未确认暴露拦截测试改走 `UNCONFIRMED_EXPOSURE_LIMIT`，不再写死 `count: 3`。签发前检查已用同一上限。不把灰度指标写成已接入。
- 2026-08-15：纠错冻结测试的活动 reservation 秒数改走 `PLAYBACK_WINDOW_SECONDS`，不再写死 `5` / `96`。签发预留窗口实现已用同一常量。不把灰度指标写成已接入。
- 2026-08-15：管理端纠错表单默认秒数改走 `COMPENSATION_SECONDS_MIN`，不再写死 `60`。纠错下限仍为 1，未改成补偿下限。不把灰度指标写成已接入。
- 2026-08-15：管理端补偿表单默认秒数改走 `REWARD_SECONDS`，不再写死 `600`。补偿上下限仍为 `COMPENSATION_SECONDS_MIN`–`ENTITLEMENT_SECONDS_MAX`。不把灰度指标写成已接入。
- 2026-08-15：两套观看端去掉本地 `PLAYBACK_LEASE_STATUS` 对象；Mock 租约状态改走契约 `PlaybackLeaseStatus`。播放会话判断已用同一枚举。不把灰度指标写成已接入。
- 2026-08-15：两套观看端 Mock 租约 `heartbeatIntervalSeconds` 改走 `HEARTBEAT_INTERVAL_SECONDS`，不再写死 `5`。服务端签发与播放器回退仍用同一间隔。不把灰度指标写成已接入。
- 2026-08-15：两套观看端 Mock 播放短凭证过期时间、以及 Mock VOD JWT `expiresIn` 上限，改走 `PLAYBACK_TOKEN_TTL_SECONDS`，不再写死 `120_000` / `Math.min(120, …)`。Live VOD 签名仍 fail-closed。不把灰度指标写成已接入。
- 2026-08-15：两套观看端 Mock 匿名 viewer `expiresAt` 改走 `ANONYMOUS_VIEWER_TTL_SECONDS`，不再写死 `30 * 60 * 1000`。服务端签发仍用同一 TTL。不把灰度指标写成已接入。
- 2026-08-15：uni-app Mock 搜索分页改走契约 `SEARCH_PAGE_SIZE`，去掉本地 `FEED_PAGE_SIZE=20`。超过 `SEARCH_MAX_PAGE` 仍返回空结果。不把灰度指标写成已接入。
- 2026-08-15：管理端剧目/审计关键词截断测试改走 `LIST_QUERY_MAX_LENGTH`，不再写死 `repeat(100)` / `repeat(120)`。不把灰度指标写成已接入。
- 2026-08-15：管理端 mock、测试夹具和发布闸门样例摘要改走 `RIGHTS_MATERIAL_DIGEST_LENGTH`，不再写死 `repeat(64)`。不把灰度指标写成已接入。
- 2026-08-15：两套观看端免费集数、心跳周期和离线宽限改走契约 `FREE_EPISODE_COUNT`、`HEARTBEAT_INTERVAL_SECONDS`、`OFFLINE_GRACE_SECONDS`，不再在本地 runtime 写死 2/5/15。服务端仍重新判定免费集。不把灰度指标写成已接入。
- 2026-08-15：JSON/urlencoded 请求体上限收入契约 `JSON_BODY_LIMIT=64kb`；Nest body parser 共用该值。不把灰度指标写成已接入。
- 2026-08-15：非生产 Prisma seed 样例权利改走 `RIGHTS_TERRITORY` 与 `RIGHTS_MATERIAL_DIGEST_LENGTH`，不再写死 `CN` / `repeat(64)`。生产仍不写入样例剧。不把灰度指标写成已接入。
- 2026-08-15：管理端读写限频的管理员 ID 截断改走 `RATE_LIMIT_CLIENT_KEY_MAX_LENGTH=128`，不再写死 `slice(0, 64)`。登录 IP+邮箱键仍完整哈希。不把灰度指标写成已接入。
- 2026-08-15：HTTP 访问日志 path/method/actorKind/module/code/actorId 收入契约 `REQUEST_LOG_PATH_MAX_LENGTH=256`、`REQUEST_LOG_METHOD_MAX_LENGTH=16`、`REQUEST_LOG_ACTOR_KIND_MAX_LENGTH=32`、`REQUEST_LOG_LABEL_MAX_LENGTH=64`。仍去掉查询串，不记录 Authorization 或请求体。不把灰度指标写成已接入。
- 2026-08-15：熔断 `updatedBy` 收入契约 `CIRCUIT_UPDATED_BY_MAX_LENGTH=128`，管理员写入与死信/对账作业共用 `boundCircuitUpdatedBy`；provider 名最长 `CIRCUIT_PROVIDER_NAME_MAX_LENGTH=32`。已打开的熔断仍不覆盖操作者。不把灰度指标写成已接入。
- 2026-08-15：限频桶主键/IP 键/scope 前缀收入契约 `RATE_LIMIT_BUCKET_ID_MAX_LENGTH=128`、`RATE_LIMIT_CLIENT_KEY_MAX_LENGTH=128`、`RATE_LIMIT_SCOPE_MAX_LENGTH=32`，与 Prisma 列宽对齐。哈希仍覆盖完整 scope 与主体键。不把灰度指标写成已接入。
- 2026-08-15：HTTP `requestId` 收入契约 `REQUEST_ID_MAX_LENGTH=128` 与 `REQUEST_ID_PATTERN`；入站 `x-request-id`、访问日志和审计写入共用。不把灰度指标写成已接入。
- 2026-08-15：播放恢复事件写入 `deviceId`/`reason` 改走 `DEVICE_ID_MAX_LENGTH` 与 `ENTITY_ID_MAX_LENGTH`；宽限计数使用同一截断后的设备 ID。不把灰度指标写成已接入。
- 2026-08-15：纠错与回调重放写入原因/审批记录改走 `ADMIN_REASON_MAX_LENGTH`，不再写死 `slice(0, 300)`。不把灰度指标写成已接入。
- 2026-08-15：权利地域收入契约 `RIGHTS_TERRITORY=CN`；DTO、发布闸门和管理端 live 保存共用，编辑页不加地域控件。不把灰度指标写成已接入。
- 2026-08-15：管理员密码下限收入契约 `PASSWORD_MIN_LENGTH=8`；登录框 minlength 与 DTO 共用。OTP 下限 `OTP_MIN_LENGTH=6`、界面仍 `OTP_INPUT_LENGTH=6`，服务端上限仍 8。不把灰度指标写成已接入。
- 2026-08-15：推荐排序收入契约 `RECOMMENDATION_RANK_MIN=0`、`RECOMMENDATION_RANK_MAX=9999`、`RECOMMENDATION_RANK_DEFAULT=0`；创建/修改 DTO 与管理端 live 保存共用，编辑页不加排序控件。不把灰度指标写成已接入。
- 2026-08-15：播放倍速收入契约 `PLAYBACK_RATE_MIN=0.75`、`PLAYBACK_RATE_MAX=2` 与预设 `PLAYBACK_RATES`；心跳 DTO、结算钳制和两端播放器按钮共用。不把灰度指标写成已接入。
- 2026-08-15：内容审核 `notes` 上限收入契约 `REVIEW_NOTES_MAX_LENGTH=2000`；退回框 maxlength 与之共用，空白通过不再发送空 `notes`，超长在请求前拦截。媒体审核仍为 6–500，未改成 2000。不把灰度指标写成已接入。
- 2026-08-15：上传签名 `contentType` 白名单收入契约 `UPLOAD_CONTENT_TYPES`；空类型仍回退 `application/octet-stream`，其它类型在请求签名前拦截。不把灰度指标写成已接入。
- 2026-08-15：上传签名 `size` 上限收入契约 `UPLOAD_FILE_SIZE_MAX_BYTES`（5×1024³ 字节）；空文件和超大文件在请求签名前拦截。不把灰度指标写成已接入。
- 2026-08-15：校准审核队列文档与实现：队列只按 `PENDING_REVIEW` 分页，不接受 `q`/`query`。剧目列表用 `q`、审计日志用 `query`。不把灰度指标写成已接入。
- 2026-08-15：上传签名 `fileName` 上限收入契约 `UPLOAD_FILE_NAME_MAX_LENGTH=255`；DTO 与管理端选文件共用该上限，超长或含路径分隔符的文件名在请求签名前拦截。不把灰度指标写成已接入。
- 2026-08-15：观看端首页/搜索/分类搜索框 maxlength 接到 `LIST_QUERY_MAX_LENGTH`；提交与公开搜索、管理端列表查询共用 `boundListQuery`（trim 后最长 100）。不把灰度指标写成已接入。
- 2026-08-15：关键词上限收入契约 `LIST_QUERY_MAX_LENGTH=100`；管理端剧目/审计搜索框与公开搜索截断共用该常量。运营页补偿/纠错/重放/补发的实体 ID 输入 maxlength 与 `ENTITY_ID_MAX_LENGTH` 对齐，超长在提交前拦截。不把灰度指标写成已接入。
- 2026-08-15：管理端登录表单邮箱/密码 maxlength 与契约共用（254 / 128）；超长在提交前拦截，不发登录请求。一次性验证码输入仍为 6 位 TOTP，服务端 OTP 仍允许 6–8。不把灰度指标写成已接入。
- 2026-08-15：两套观看端奖励完成/注销申请的 `Idempotency-Key` 改走契约 `boundedIdempotencyKey`。短实体 ID 仍用原来的 `reward-${id}` / `d:${userId}`，避免进行中的重试换键；超长 ID 折叠成前缀加 16 位稳定十六进制，保证不超过 128。不把灰度指标写成已接入。
- 2026-08-14：管理端纠错、回调重放和补发注销令牌在 handler 入口把 `Idempotency-Key` 交给与补偿共用的规范化；空白或 trim 后超过 128 的键返回 `IDEMPOTENCY_KEY_REQUIRED`，不再进入账本/重放/补发查询。写操作 Guard 仍先占 `adminWrite` 桶，不能跳过。不把灰度指标写成已接入。
- 2026-08-14：注销申请控制器始终把 `Idempotency-Key` 交给与奖励完成/补偿共用的规范化；空白或 trim 后超过 128 的键返回 `IDEMPOTENCY_KEY_REQUIRED`，不占 `deletionCreate` 桶、不查库、不兑换微信 `code`。管理端纠错/重放/补发令牌仍在写 Guard 之后规范化。不把灰度指标写成已接入。
- 2026-08-14：provider 回调入口改走 `API_ROUTES.callbacks`（`/v1/callbacks/vod` 与 `/v1/callbacks/reward`）。该路径是 provider 专用，不给观看端或管理端客户端调用。Nest HTTP 装饰器不再硬编码路径字符串。不把灰度指标写成已接入。
- 2026-08-14：管理端剩余 Nest 路径改走 `API_ROUTES.admin`：熔断、补偿/纠错、回调列表/重放、注销查询/补发令牌、发布闸门。`AdminController` 不再硬编码相对路径。provider 回调入口仍为纯服务端路径。不把灰度指标写成已接入。
- 2026-08-14：管理端剧目/权利/媒体/审核/发布/下架/上传签名/审核队列/审计日志 Nest 路径改走 `API_ROUTES.admin`，控制器仍用 `/v1/admin` 前缀；熔断、补偿、回调和注销路径留待下一批。管理端请求路径 ID 改用 `encodedRoute`。不把灰度指标写成已接入。
- 2026-08-14：两套观看端 HTTP 路径改走契约 `API_ROUTES`，不再各自维护一份字符串表；路径实体 ID 经 `encodedRoute` 做 URL-encode。管理端相对路径和 provider 回调仍未整表改写。不把灰度指标写成已接入。
- 2026-08-14：观看端 Nest 路径改走 `API_ROUTES`：剧目详情、权益摘要、注销申请/查询、播放租约（签发/活动/心跳/续签/恢复/关闭）。管理端仍用 `/v1/admin` 前缀，provider 回调仍为纯服务端路径。不把灰度指标写成已接入。
- 2026-08-14：奖励完成 `Idempotency-Key` 与补偿/注销共用规范化：trim 后最长 128，空白或超长返回 `IDEMPOTENCY_KEY_REQUIRED` 且不占完成限频桶。完成路径改走 `API_ROUTES.rewardComplete`。不把灰度指标写成已接入。
- 2026-08-14：管理端剧目编辑表单与契约共用标题 120、简介 2000、分类 64、标签 20×32、封面 URL 2048、集标题 120、单集时长 3600、最多 200 集，以及权利人/证号/材料键上限；保存前在客户端拦截，Mock 保存同样拒绝超限草稿。不把灰度指标写成已接入。
- 2026-08-14：剩余请求头补上限：Bearer 4096、注销查询令牌 128、`Idempotency-Key` 128、回调签名 256；超长不验 JWT/不哈希令牌/不 HMAC。下架与熔断原因与补偿共用 6–300 字；审核退回意见仍最长 2000。不把灰度指标写成已接入。
- 2026-08-14：管理端审计日志与剧目/审核队列共用每页 50、最多 100 页；超页返回空结果且不打大 OFFSET。关键词截到 100 字，在服务端按动作、目标、`requestId` 和操作人邮箱过滤；管理端不再只对本地 200 条做客户端筛选。不把灰度指标写成已接入。
- 2026-08-14：路径和查询中的实体 ID 与写 DTO 共用 191 上限。超长 ID 返回 `INVALID_ENTITY_ID`，不查库；公开详情、权益摘要、播放租约和注销进度查询仍先计入限频桶。不把灰度指标写成已接入。
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
- 2026-08-14：登录、匿名新建会话、目录/剧目详情/搜索、播放租约签发/心跳/续签/恢复/关闭/活动查询、观看历史/进度、权益摘要、奖励 challenge 创建/完成、注销新建申请/进度查询、管理端写操作/只读 GET 和 VOD/奖励回调使用 Prisma `RateLimitBucket` 限频；桶 ID 最长 `RATE_LIMIT_BUCKET_ID_MAX_LENGTH`，连接 IP 键最长 `RATE_LIMIT_CLIENT_KEY_MAX_LENGTH`，键取连接 `socket.remoteAddress` 或已认证主体，不信任 `X-Forwarded-For`。超限返回 `RATE_LIMITED`。后台任务删除超过 24 小时的桶。
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
