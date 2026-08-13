# 微光短剧

微信免费短剧小程序的首版工程，包含原生微信小程序、Vue 3 内容管理后台、NestJS API 和 MySQL 数据模型。默认以安全的内部体验模式运行；没有通过资质、备案、微信类目和广告准入闸门时，生产服务会拒绝启动。

## 工程结构

```text
apps/api          NestJS API、Prisma 数据模型、权益账本和云服务适配层
apps/admin        Vue 3 PC 内容管理后台
apps/miniprogram  原生微信小程序 TypeScript 用户端
packages/contracts 共享接口、枚举和产品常量
docs              产品计划、架构、上线、合规和运营手册
```

当前产品计划见 [docs/product-plan.md](docs/product-plan.md)：先收口内部联调，再验证内容与「看广告换继续看」，不以对外上线为本轮目标。

实现默认值写在共享常量里：每部剧前 2 集免费；完整观看一次激励广告为当前剧发放 600 秒额度；每笔额度独立在 24 小时后失效；锁定内容每 5 秒按实际媒体进度结算。这些是 v0 账本默认值，灰度前可按计划调整文案和数值，不能绕过服务端账本与发布闸门。

## 本地启动

要求 Node.js 20.19+、npm 11+、Docker Desktop，以及微信开发者工具。

```bash
cp .env.example .env
docker compose up -d mysql
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
- 管理后台：`http://localhost:5173`
- 小程序：使用微信开发者工具导入 `apps/miniprogram`，在本地设置中允许调试时使用 HTTP。

本地默认使用 Mock 微信登录和 Mock VOD。Mock 状态会在界面显著标识，不能用于外部灰度或正式发布。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

测试重点覆盖广告奖励幂等、24 小时额度、FEFO 消耗、心跳重复和乱序、暂停/缓冲不扣费、单活播放租约和内容发布闸门。

## 生产发布限制

当前版本是可供内部技术闭环和接口联调的 MVP，不是可直接上线包。微信登录的 `code2session` 已有真实适配，但腾讯 VOD Web 上传/播放签名和激励广告可信服务端验证仍安全失败；API 会用 `LIVE_PROVIDER_IMPLEMENTATION_REQUIRED` 阻止发布并拒绝生产启动。完成企业账号接入和真实环境验收后，才能移除这项代码级阻断。

上线前必须完成 [发布清单](docs/release-checklist.md)。至少需要：

- 企业主体、小程序备案、微信微短剧类目及广告能力全部通过；
- 每部剧逐一完成版权、发行许可或上线报备、版本和广告变现权核验；
- `WECHAT_MODE=live`、`VOD_MODE=live`，真实密钥从腾讯云密钥管理注入；
- HTTPS 的 `admin`、`api`、`media` 子域名完成备案和微信合法域名配置；
- 真机、弱网、下架、回调重放、权益账本和安全验收通过。

代码不会绕过微信或广电审核。若微信没有提供可信的激励广告服务端验证，客户端 `isEnded` 证明仅允许在小流量灰度中使用，并视为已知的反作弊残余风险。

## Android 参考项目

产品流程与观看端 UI 节奏参考了 [`IronManyz/qg_android`](https://github.com/IronManyz/qg_android)，但未复制其源码、资源、密钥或闭源 Android SDK。图标从 [iconfont](https://www.iconfont.cn/search/index?q=%E6%99%BA%E8%83%BD%E4%BD%93&searchType=icon) 自选导出。该项目无法转换为微信小程序，且其 README 与许可证、客户端签名及仓库密钥存在商用和安全风险。参考范围见 [docs/product-plan.md](docs/product-plan.md) 中「Android 参考」一节。

## 安全

不要提交 `.env`、微信 AppSecret、腾讯云 Secret、VOD 防盗链 Key、广告位真实配置、证书或版权原件。发现安全问题时先停用相关凭据和播放签发，再通过内部安全渠道处理；不要在公开 Issue 粘贴秘密或用户数据。
