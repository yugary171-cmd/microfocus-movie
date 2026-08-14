# 微焦短剧

微信免费短剧项目的首版工程，包含 Vue 3 uni-app 观看端、原生微信过渡端、Vue 3 内容管理后台、NestJS API 和 MySQL 数据模型。默认以安全的内部体验模式运行；没有通过资质、备案、微信类目、广告准入和工程闸门时，生产服务会拒绝启动。

## 工程结构

```text
apps/api          NestJS API、Prisma 数据模型、权益账本和云服务适配层
apps/admin        Vue 3 PC 内容管理后台
apps/uniapp       Vue 3 uni-app 观看端（微信对齐优先；H5/App 登录与广告单独适配）
apps/miniprogram  原生微信小程序（过渡对照，微信端验收后弃用）
packages/contracts 共享接口、枚举和产品常量
docs              产品计划、架构、部署、上线、合规和运营手册
RULES.md          工程与代码规范（AI Agent 与开发者必读）
AGENTS.md         Agent 操作边界、验证和交付约定
```

当前产品计划见 [docs/product-plan.md](docs/product-plan.md)：先收口内部联调，再验证内容与「看广告换继续看」，不以对外上线为本轮目标。

目标架构与当前代码并非完全等价；已实现、部分实现和仅目标设计的能力以 [docs/status.md](docs/status.md) 的实现矩阵为准。数据库、服务器与各端关系见 [部署与运行组件](docs/deployment.md)。

实现默认值写在共享常量里：每部剧前 2 集免费；完整观看一次激励广告为当前剧发放 600 秒额度；每笔额度独立在 24 小时后失效；锁定内容每 5 秒按实际媒体进度结算。这些是 v0 账本默认值，灰度前可按计划调整文案和数值，不能绕过服务端账本与发布闸门。

## 本地启动

要求 Node.js 20.19+（CI 使用 Node.js 22）、兼容当前 lockfile 的 npm、Docker Desktop，以及微信开发者工具。仓库尚未锁定独立 npm 主版本，不应仅凭本地 npm 版本声明兼容性。

```bash
cp .env.example .env
npm run db:up
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
```

另开终端启动后台：

```bash
npm run dev:admin
```

- API：`http://localhost:3000`
- Swagger：`http://localhost:3000/docs`
- 管理后台：`http://localhost:5174`
- 观看端：运行 `npm run dev:uniapp` 后，在微信开发者工具导入 `apps/uniapp/dist/dev/mp-weixin`；也可用 HBuilderX 打开 `apps/uniapp`。过渡对照端可直接导入 `apps/miniprogram`。本地设置中允许调试时使用 HTTP。

本地默认使用 Mock 微信登录和 Mock VOD。Mock 状态会在界面显著标识，不能用于外部灰度或正式发布。`npm run db:up` 会等到 MySQL 健康检查通过后再返回，避免容器刚 `Started` 就迁移导致 `P1017`。`db:migrate`（Prisma `migrate dev`）需要本地 MySQL 用户能创建影子库；权限由 `docker/mysql/init` 在首次建卷时授予。若容器早已存在并报 `P3014`，见 [部署与运行组件](docs/deployment.md) §4.2。

### 本地试播视频

Mock 试播文件在 `apps/admin/public/demo/`（默认 gitignore，本机已有 mp4 即可），视频文件本身不会打进小程序包，但当前构建会注入 Demo 媒体地址。开发时会自动使用这台电脑的**局域网 IPv4**（例如 `http://192.168.1.23:5174/demo/short-drama.mp4`），这样微信真机调试才能访问；电脑模拟器仍可播。可用根目录 `.env` 的 `DEMO_MEDIA_ORIGIN` 覆盖。

本机若只有你上传的两支片子，可生成另外 8 支竖屏占位片（不会覆盖已有 mp4）：

```bash
npm run generate:demo-videos
```

需要同时：

1. 启动 `npm run dev:admin`（监听 `0.0.0.0:5174`，手机和电脑同一 Wi-Fi；改过 Vite 配置后请重启一次）；
2. 再启动 `npm run dev:uniapp`，让观看端编译进当前局域网地址（换 Wi-Fi 后要重启这两个进程）；
3. 微信开发者工具勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。

若真机仍无法播放：确认 Mac 防火墙未拦截 5174，终端里应能看到 `[microfocus] mock videos on LAN: http://<局域网IP>:5174/demo/`。

正式发布不能依赖这些本地 mp4。当前生产构建禁用 Demo 注入的机制尚未完成，因此外部构建保持关闭；目标生产播放地址来自点播租约的 HTTPS URL。

### 后台登录模式

未配置 `VITE_API_BASE_URL` 时，后台是 Mock 演示模式：输入符合格式的邮箱、8 位以上密码和 6 位验证码即可进入，角色下拉框只用于体验权限边界，不代表真实账号鉴权。配置 API 地址后才进入真实模式；真实管理员登录由 API 校验密码、JWT 和 TOTP，一次登录会话过期后需要重新登录。系统不提供开放注册，管理员账号由部署/运维通过 seed 或受控管理流程创建。

## 验证

```bash
npm run check
```

当前自动化验证包括 TypeScript 检查、单元/组件测试和各 workspace 构建，覆盖基础奖励幂等、24 小时额度、FEFO、心跳重复/乱序、暂停/缓冲不扣费、单活租约状态和内容发布规则。它不等于 HTTP E2E、真实 MySQL 并发、真机或真实 provider 验收；实际覆盖和缺口见 [项目状态](docs/status.md)。

## 生产发布限制

当前版本是可供内部技术闭环和接口联调的 MVP，不是可直接上线包。微信登录的 `code2session` 已有真实适配，但腾讯 VOD Web 上传/播放签名和激励广告可信服务端验证仍安全失败；API 会用 `LIVE_PROVIDER_IMPLEMENTATION_REQUIRED` 阻止发布并拒绝生产启动。

客户端内部构建默认 Mock。外部包必须 `npm run build:admin:live` 与 `npm run build:uniapp:live`，并提供公开 HTTPS API 地址；缺地址或含 Demo 媒体会失败。全部代码和构建阻塞见 [项目状态](docs/status.md) 与 [配置说明](docs/configuration.md)；不能只移除最终拒启或把 provider 模式改成 `live`。

上线前必须完成 [发布清单](docs/release-checklist.md)。至少需要：

- 企业主体、小程序备案、微信微短剧类目及广告能力全部通过；
- 每部剧逐一完成版权、发行许可或上线报备、版本和广告变现权核验；
- `WECHAT_MODE=live`、`VOD_MODE=live`，真实密钥从腾讯云密钥管理注入；
- HTTPS 的 `admin`、`api`、`media` 子域名完成备案和微信合法域名配置；
- 真机、弱网、下架、回调重放、权益账本和安全验收通过。

代码不会绕过微信或广电审核。若微信没有提供可信的激励广告服务端验证，外部灰度必须保持关闭；客户端 `isEnded` 证明仅限非生产内部技术验证，绝不能用于外部灰度或商业化。

## 安全

不要提交 `.env`、微信 AppSecret、腾讯云 Secret、VOD 防盗链 Key、广告位真实配置、证书或版权原件。发现安全问题时先停用相关凭据和播放签发，再通过内部安全渠道处理；不要在公开 Issue 粘贴秘密或用户数据。
