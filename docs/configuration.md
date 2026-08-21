# 环境配置与外部服务接入

- 文档用途：定义配置来源、暴露边界、环境差异、生产闸门和秘密生命周期
- 更新日期：2026-08-21
- 本文不保存任何真实账号、域名、密钥或审批结果

## 1. 配置事实来源与加载规则

- 根目录 `.env.example` 是 API、脚本和本地运行变量清单，不包含可用秘密；客户端构建变量由对应 Vite/运行时配置另行定义。
- `apps/api/src/config/env.ts` 是 API 可接受值、默认值和生产启动校验的可执行契约；模板、本文与代码冲突时，以代码拒绝行为为准，并在同一变更中修正文档和模板。
- 本地 API、Prisma 迁移和种子命令通过根目录 `.env` 加载配置；`.env` 不得提交。
- 部署环境由平台或密钥管理注入 `process.env`，不得依赖镜像内置 `.env`。各端托管关系与 MySQL 边界见 [deployment.md](./deployment.md)。
- API 在启动时解析并缓存配置。配置变化需要新进程或滚动重启，不把环境变量当作动态开关。
- `NODE_ENV` 缺省为 `development`；生产部署必须显式设置 `NODE_ENV=production`，不能依赖默认值判断环境。

## 2. 配置分类与暴露边界

| 分类 | 变量 | 规则 |
| --- | --- | --- |
| API 普通配置 | `NODE_ENV`、`PORT`、`PUBLIC_API_URL`、`ADMIN_ORIGIN`、`ADMIN_ACCESS_TOKEN_TTL_SECONDS`、`ADMIN_REFRESH_TOKEN_TTL_SECONDS`、`ADMIN_REFRESH_COOKIE_SAME_SITE` | 可以进入部署清单，但不能由客户端任意覆盖；access TTL 为 300–3600 秒，refresh TTL 为 3600–7776000 秒，生产 Cookie 由 API 强制 `Secure` |
| 数据库与签名秘密 | `DATABASE_URL`、`JWT_SECRET`、`TOTP_ENCRYPTION_KEY`、`TOTP_ENCRYPTION_KEY_PREVIOUS`、`CALLBACK_PAYLOAD_ENCRYPTION_KEY`、`VOD_PLAYBACK_KEY` | 只注入 API/受控任务；不得进入浏览器、小程序、日志或错误响应 |
| 初始化配置与秘密 | `ADMIN_BOOTSTRAP_EMAIL`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_TOTP_SECRET` | 只供一次性种子流程使用，初始化后从常驻环境移除密码和 TOTP 明文 |
| 本地测试配置 | `ADMIN_TEST_OTP`、`DEMO_MEDIA_ORIGIN`、`INTERNAL_CLIENT_ATTESTATION` | 仅限开发或经批准的非生产内部验证 |
| 合规闸门 | `COMPLIANCE_ENTITY_APPROVED`、`COMPLIANCE_MINIPROGRAM_FILING`、`COMPLIANCE_WECHAT_CATEGORY`、`COMPLIANCE_ADS_APPROVED` | 只由获授权负责人依据有效证据变更；不是普通功能开关 |
| 微信配置 | `WECHAT_MODE`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_REWARDED_AD_UNIT_ID`、`WECHAT_REWARD_VERIFICATION`、`WECHAT_CALLBACK_SECRET` | AppID/广告位 ID 可公开给对应客户端；AppSecret 和回调秘密只能在服务端 |
| COS 海报配置 | `POSTER_STORAGE_MODE`、`TENCENTCLOUD_COS_SECRET_ID`、`TENCENTCLOUD_COS_SECRET_KEY`、`TENCENTCLOUD_COS_BUCKET`、`TENCENTCLOUD_COS_REGION`、`TENCENTCLOUD_COS_PUBLIC_ORIGIN`、`TENCENTCLOUD_COS_PREFIX` | COS 云密钥只在服务端；浏览器只拿短期单对象上传授权；访问地址使用配置的 HTTPS 自定义域名 |
| VOD 配置 | `VOD_MODE`、`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`、`TENCENTCLOUD_VOD_REGION`、`TENCENTCLOUD_VOD_SUB_APP_ID`、`TENCENTCLOUD_VOD_PROCEDURE`、`TENCENTCLOUD_VOD_CALLBACK_SECRET`、`VOD_MEDIA_HOST` | 云密钥和回调秘密只在服务端；媒体域名和子应用标识不授予访问权限 |

`RELEASE_GATE_ENABLED` 当前会被 API 解析，但不是生产安全校验的旁路开关。生产检查在 `NODE_ENV=production` 时无条件执行；不得通过将该值改为 `false` 尝试上线。

## 3. 本地内部体验

```dotenv
NODE_ENV=development
PORT=3000
PUBLIC_API_URL=http://localhost:3000
ADMIN_ORIGIN=http://localhost:5174
WECHAT_MODE=mock
VOD_MODE=mock
WECHAT_REWARD_VERIFICATION=client_attestation
INTERNAL_CLIENT_ATTESTATION=true
RELEASE_GATE_ENABLED=true
COMPLIANCE_ENTITY_APPROVED=false
COMPLIANCE_MINIPROGRAM_FILING=false
COMPLIANCE_WECHAT_CATEGORY=false
COMPLIANCE_ADS_APPROVED=false
```

Mock 模式只提供确定性开发数据，不模拟真实广告收入、微信审核、版权许可或视频发布资格。管理后台和观看端必须展示“内部体验”标识，Mock 失败时不得自动回退为伪造成功。

本地管理员可使用 `ADMIN_TEST_OTP`。该变量不得进入生产；生产管理员初始化必须提供 Base32 格式的 `ADMIN_BOOTSTRAP_TOTP_SECRET` 与至少 32 字符的 `TOTP_ENCRYPTION_KEY`。种子脚本只写入 AES-256-GCM 密文，初始化完成后应移除 bootstrap 密码和 TOTP 明文。全员无法登录时使用公开命令 `npm run db:admin-break-glass`（见 [admin-emergency-access.md](./admin-emergency-access.md)），不要把 `ADMIN_BREAK_GLASS_*` 写入常驻 API 环境。回调规范化载荷使用 AES-256-GCM；`CALLBACK_PAYLOAD_ENCRYPTION_KEY` 可选，缺省回退到 `TOTP_ENCRYPTION_KEY`。密文不得写入日志或工单。

### 3.1 Demo 媒体

- `DEMO_MEDIA_ORIGIN` 仅用于 Mock 视频。留空时开发脚本尝试使用本机局域网 IPv4。
- 开发脚本会为原生小程序生成 `demo-media-origin.generated.ts`，并为 uni-app 构建注入 `VITE_DEMO_MEDIA_ORIGIN`。
- 生成值可能包含本机 IP，不是生产配置来源；外部构建必须确认 Demo URL、Mock 数据和内部体验入口均未进入构建物。
- 生产播放地址只能由 API 在有效租约内签发，不能回退到 `DEMO_MEDIA_ORIGIN`。

## 4. 客户端构建配置

- 管理后台通过公开的 `VITE_API_BASE_URL` 或统一的 `MICROFOCUS_PUBLIC_API_URL` 选择 API Base URL；它会进入浏览器构建物，因此只能包含公开 HTTPS 地址。
- 原生小程序和 uni-app 的 `RUNTIME_CONFIG.apiBaseUrl` 由同一套构建配置注入，不会自动继承 API 进程的 `PUBLIC_API_URL`。外部构建必须通过 `MICROFOCUS_CLIENT_MODE=live` 设置，并校验为微信合法 HTTPS 域名。
- `PUBLIC_API_URL` 是 API 自身用于生成绝对地址和校验部署环境的服务端配置，不等于客户端构建变量。
- 任何 `VITE_*`、生成的 TypeScript 配置、`app.json`、`manifest.json` 或小程序项目配置都不得包含 AppSecret、云 SecretKey、数据库 URL、JWT/TOTP/回调/播放签名密钥。
- 同一发布记录必须保存 API 地址、管理端 Origin、微信 AppID、VOD 子应用 ID、媒体域名和构建版本的非秘密快照，便于排查环境串用。

### 4.1 外部构建闸门

内部 `npm run build` / `npm run check` 默认 `MICROFOCUS_CLIENT_MODE=mock`：允许空 API 地址、注入 Demo 媒体，供本机联调。不得把这次构建物当作外部包。

外部包必须显式使用 Live 构建，缺少配置或含 Demo 媒体时失败：

```bash
MICROFOCUS_CLIENT_MODE=live
MICROFOCUS_PUBLIC_API_URL=https://api.example.com
npm run build:admin:live
npm run build:uniapp:live
```

Live 闸门由 [`scripts/client-build-config.ts`](../scripts/client-build-config.ts) 执行：

- 公开 API 地址必须是 https 域名（不能是 IP、localhost、非 443 端口、路径或查询串）；
- 不注入 `VITE_DEMO_MEDIA_ORIGIN`，并把原生小程序 Demo origin 写成空；
- 对管理端 `dist` 与 uni-app `dist/build/mp-weixin` 扫描 Demo 媒体痕迹，命中即失败。

`PUBLIC_API_URL` 仍只属于 API 进程。客户端 Live 地址必须单独注入。解除这些闸门之外的阻塞（真实 Live provider、发布证据）见 [status.md](./status.md)。

## 5. 微信 Live 接入

1. 在企业主体的小程序后台取得 AppID，并将 AppSecret 存入密钥管理。
2. 配置 API 为 request 合法域名、VOD/CDN 为 download 合法域名，并确保全链路 HTTPS。
3. 登录使用 `jscode2session`，只由服务端调用；`session_key` 不返回客户端、不写日志。
4. 在实际账号内开通激励广告位；小程序只获取可公开的广告位 ID。
5. 奖励回调必须使用独立秘密验签，并按事件 ID 幂等处理；不得复用 AppSecret、JWT secret 或播放签名 Key。
6. 外部灰度与生产必须使用可信服务端奖励验证或可信回调。若平台无可用能力，外部灰度保持关闭；`client_attestation` 只能用于经书面批准、明确标识的非生产内部技术验证。

```dotenv
WECHAT_MODE=live
WECHAT_APP_ID=...
WECHAT_APP_SECRET=secret-manager-reference
WECHAT_REWARDED_AD_UNIT_ID=...
WECHAT_REWARD_VERIFICATION=server_verified
WECHAT_CALLBACK_SECRET=secret-manager-reference
INTERNAL_CLIENT_ATTESTATION=false
```

## 6. 腾讯云 VOD Live 接入

1. 创建独立子账号和最小权限策略，不使用主账号密钥；开发、预发布和生产使用不同凭据与子应用。
2. 创建 VOD 子应用、转码/截图/内容审核任务流和微信小程序视频发布配置。
3. 配置媒体域名、HTTPS、Key 防盗链和回调地址。
4. 浏览器上传签名只由 API 短期签发，并限制子应用、文件类型、任务流和有效期。
5. VOD 回调校验腾讯云 `Sign`/`T`（`Sign = MD5(SignKey + T)`）和唯一事件 ID；同时启用时间窗与重放校验。不得根据浏览器上报直接标记媒体 READY。
6. `VOD_PLAYBACK_KEY` 只用于短期播放授权，不与 VOD 回调秘密或云 API 密钥复用。
7. 锁定内容按架构文档要求使用租约绑定的短媒体窗口；120 秒外层凭证不能暴露整集可连续下载地址。

```dotenv
VOD_MODE=live
TENCENTCLOUD_SECRET_ID=secret-manager-reference
TENCENTCLOUD_SECRET_KEY=secret-manager-reference
TENCENTCLOUD_VOD_SUB_APP_ID=...
TENCENTCLOUD_VOD_PROCEDURE=...
TENCENTCLOUD_VOD_CALLBACK_SECRET=secret-manager-reference
VOD_PLAYBACK_KEY=secret-manager-reference
VOD_MEDIA_HOST=media.example.com
```

## 6.1 腾讯云 COS 海报 Live 接入

1. 使用独立子账号和最小权限策略，仅允许目标桶内剧目海报前缀的上传、读取和必要的对象元数据校验。
2. 配置管理端 Origin 的 COS CORS；浏览器只使用 API 签发的短期单对象 PUT 授权，不接触 COS SecretKey。
3. `TENCENTCLOUD_COS_PUBLIC_ORIGIN` 使用 HTTPS 自定义域名或 CDN 域名，不能把临时上传 URL 当作长期海报地址。
4. 上传会话绑定管理员、剧目、海报类型和过期时间；API 完成 HEAD 校验后才允许保存 `coverUrl` 或 `promoCoverUrl`。

```dotenv
POSTER_STORAGE_MODE=live
TENCENTCLOUD_COS_SECRET_ID=secret-manager-reference
TENCENTCLOUD_COS_SECRET_KEY=secret-manager-reference
TENCENTCLOUD_COS_BUCKET=microfocus-1234567890
TENCENTCLOUD_COS_REGION=ap-guangzhou
TENCENTCLOUD_COS_PUBLIC_ORIGIN=https://image.example.com
TENCENTCLOUD_COS_PREFIX=microfocus/dramas
```

## 7. 生产启动闸门

真实 COS 海报上传和 VOD 媒体上传完成后，仍不能直接解除生产启动拒绝。VOD 播放签名、微信激励广告服务端验证和合规证据仍由独立闸门控制；`NODE_ENV=production` 仍会在这些条件未完成时安全拒启，release gate 也会保留 `LIVE_PROVIDER_IMPLEMENTATION_REQUIRED`。以下条件是完成真实 provider 后仍必须保留的第二层闸门，不是把模式改成 `live` 即可绕过的开关。

`NODE_ENV=production` 的目标启动校验包括：

- 微信和 VOD 均为 Live provider；
- 企业主体、小程序备案、微信类目和广告准入均有有效证据并配置为 `true`；
- `PUBLIC_API_URL` 和 `ADMIN_ORIGIN` 均为 HTTPS，且与发布记录一致；
- `JWT_SECRET`、TOTP 加密密钥、微信、VOD、回调和播放签名配置存在且不是示例值；
- 奖励验证模式为 `server_verified`，`INTERNAL_CLIENT_ATTESTATION` 不参与外部流量；
- 生产种子流程拒绝示例管理员密码，并要求 TOTP 初始化与加密材料完整；
- 构建物未包含 Demo/Mock 地址、测试 OTP、bootstrap 明文或服务端秘密。

任意条件失败必须使进程退出，而不是只打印警告后继续运行。错误只报告缺失或无效的变量名，不回显变量值。

当前 `envSchema` 已包含 `ADMIN_BOOTSTRAP_TOTP_SECRET`，并拒绝微信/VOD 的 Mock/Live 混用；`assertProductionSafety()` 已检查合规项、HTTPS、Live provider、`server_verified`、主要秘密，并拒绝生产环境中的 `INTERNAL_CLIENT_ATTESTATION=true`、`ADMIN_TEST_OTP` 和残留 bootstrap 密码/TOTP。管理端 Mock release gate 也会展示 `LIVE_PROVIDER_IMPLEMENTATION_REQUIRED`。

仍未完成的生产门禁包括：客户端 Live API 构建注入与 Demo 扫描已由构建闸门执行，但真实 provider 实现仍未完成。API 无法自行检查客户端构建物，必须由构建流水线执行；现有最终拒启在真实 VOD/广告验证完成前继续保留。

## 8. 秘密轮换与变更控制

- 每个环境使用独立秘密，不在开发、预发布和生产之间复用。
- JWT secret 轮换会使现有会话失效；当前为单密钥校验时，应安排维护窗口并提前准备重新登录提示。
- TOTP 加密密钥不能直接替换。维护窗口内同时配置 `TOTP_ENCRYPTION_KEY`（新）与 `TOTP_ENCRYPTION_KEY_PREVIOUS`（旧），管理员登录会先尝试新密钥再回退旧密钥。用 `npm run totp:reencrypt -w @microfocus/api` 先 dry-run，确认失败数为 0 后再加 `--commit` 把密文重加密到新密钥；验证登录成功后移除 `TOTP_ENCRYPTION_KEY_PREVIOUS`。回滚使用 `--rollback --commit`（用当前密钥解密、写回上一密钥）。默认 dry-run 不写库。工具只输出计数和密钥指纹，不输出明文或密文。若回调载荷仍回退使用 TOTP 密钥，必须先配置独立的 `CALLBACK_PAYLOAD_ENCRYPTION_KEY` 再轮换。种子流程只创建新管理员，不更新既有 TOTP 密文；生产种子会校验 Base32 并拒绝示例 secret。
- 计划内播放签名 Key 轮换前先停止新凭证，可保留旧 Key 至最长凭证窗口结束或使用明确的双 Key 验证期；确认或合理怀疑 Key 泄露时必须立即撤销旧 Key，不保留兼容窗口。
- 微信、VOD 和回调秘密轮换必须同步 provider 配置、部署平台与回调验证，先验证新凭据再撤销旧凭据。
- 合规闸门变更必须记录证据、操作者、审批人、时间和适用环境；证据到期时应自动或人工恢复为关闭状态。
- 配置或秘密不能通过日志、工单正文、截图、聊天记录和发布证据目录传播；发布记录只保存变量名、版本或密钥指纹。

当前种子流程只创建新管理员，不更新既有管理员的 TOTP 密文。生产初始化会校验 Base32 并拒绝示例 TOTP secret。加密密钥轮换使用 `totp:reencrypt` 与双密钥窗口，不得靠重复 seed 或直接改库密文完成。

因此：

- 生产初始化失败时保持外部访问关闭并修复初始化流程，不直接修改数据库密文；
- 既有管理员不得通过重复运行 seed 轮换 TOTP 或加密密钥；
- 轮换后必须先用新密钥完成管理员登录冒烟，再从常驻环境移除 `TOTP_ENCRYPTION_KEY_PREVIOUS`。

## 9. 配置变更验证

每次配置变更至少执行：

1. 使用目标环境的非秘密副本检查必填项、枚举、URL、布尔值和秘密长度。
2. 验证 Mock/Live 不混用，客户端构建物没有服务端秘密或 Demo 地址。
3. 验证 API 启动、存活/就绪检查、管理端 CORS 和微信合法域名。生产进程不得挂载 `/docs`。
4. 对登录、上传签名、VOD 回调、奖励验证和播放短凭证执行最小冒烟测试。
5. 生产前验证闸门失败场景确实拒绝启动，而不是降级到 Mock。
6. 将非秘密配置快照、验证命令、结果和审批结论放入发布证据目录。

配置变化涉及接口、状态机或业务规则时，还必须同步 [architecture.md](./architecture.md)、[pages-and-apis.md](./pages-and-apis.md) 和 [release-checklist.md](./release-checklist.md)。
