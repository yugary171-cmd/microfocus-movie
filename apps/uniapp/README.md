# 微焦短剧观看端（uni-app）

Vue 3 + uni-app 观看端，第 1 阶段目标是**微信小程序功能对齐**现有原生端。NestJS API 与 Vue 管理后台不在本工程内。

## 导入与运行

HBuilderX：打开 `apps/uniapp`，运行到微信开发者工具。游客 AppID 为 `touristappid`。

CLI（需先在仓库根目录 `npm install`）：

```bash
npm run dev:uniapp
```

编译产物在 `apps/uniapp/dist/dev/mp-weixin`（开发）或 `dist/build/mp-weixin`（正式构建），用微信开发者工具导入该目录。

本地 Mock 条件与原生端相同：环境为 `develop` 且 `src/config/runtime.ts` 的 `apiBaseUrl` 为空。激励广告在 Mock 下会失败并提示，这是预期。

剧场试播不在小程序包内，文件在 `apps/admin/public/demo/`。开发编译会写入本机局域网 IP（`http://<局域网IP>:5174/demo/*.mp4`），供微信真机调试。需同时 `npm run dev:admin`，微信开发者工具不校验合法域名。正式发布走点播租约 HTTPS，不必改这个 mock 地址。若本地只有上传的两支片子，在仓库根目录执行 `npm run generate:demo-videos` 可再生成 8 支竖屏占位片。

验收路径：浏览 → 免费集 → 锁集拦截 → Mock 广告失败提示 → 我的/额度。

## 平台边界（不要假装跨端能力已齐）

| 能力 | 微信小程序 | H5 | App |
|---|---|---|---|
| 登录 | `uni.login` → `/v1/auth/wechat` | 不调用该接口；Mock 下游客会话，正式环境需独立身份 | 微信开放平台或手机号，需新增 API |
| 激励广告 | `uni.createRewardedVideoAd`，仅 `isEnded===true` 才 complete | 提示「请在微信小程序观看广告解锁」 | 穿山甲/优量汇等，服务端按 `platform` 校验，**不能**沿用微信 `isEnded` |
| 播放 | 租约 + 5 秒心跳 + 15 秒断网 | 可浏览/部分播放，后台行为不同 | 同样租约协议，前后台需重测 |

原生小程序 `apps/miniprogram` 仅作过渡对照，微信端验收通过后不再双轨维护。
