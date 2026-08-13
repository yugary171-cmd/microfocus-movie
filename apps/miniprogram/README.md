# Microfocus Movie 小程序

原生微信小程序 + TypeScript 用户端。导入本目录后，在微信开发者工具中执行“工具 → 构建 npm”。

本地体验默认使用游客 AppID。仅当运行环境为 `develop` 且 `miniprogram/config/runtime.ts` 的 API 地址为空时启用 mock，并在所有页面显示“内部体验数据”；`trial` / `release` 环境永不启用 mock。联调或发布前必须填写 HTTPS API 地址、在微信后台配置 request 合法域名，并通过本机 `project.private.config.json` 配置真实 AppID。

激励广告位由服务端 challenge 返回。客户端只有在微信广告回调明确给出 `isEnded: true` 时才提交完成，但这个客户端回调不能被视为绝对安全证明；服务端仍需完成挑战状态、时效、重放与风控校验。
