# 环境配置与外部服务接入

所有环境变量以根目录 `.env.example` 为准。值分为三类：普通配置、合规闸门和秘密。秘密必须由部署平台或腾讯云密钥管理注入，不能写入前端构建变量、Git、日志或错误响应。

## 本地内部体验

```dotenv
NODE_ENV=development
WECHAT_MODE=mock
VOD_MODE=mock
RELEASE_GATE_ENABLED=true
COMPLIANCE_ENTITY_APPROVED=false
COMPLIANCE_MINIPROGRAM_FILING=false
COMPLIANCE_WECHAT_CATEGORY=false
COMPLIANCE_ADS_APPROVED=false
```

Mock 模式只提供确定性的开发数据，不模拟真实广告收入、微信审核或视频发布资格。管理后台和小程序必须展示“内部体验”标识。

本地管理员可使用 `ADMIN_TEST_OTP`。生产初始化管理员时必须另外提供 Base32 格式的 `ADMIN_BOOTSTRAP_TOTP_SECRET` 与至少 32 字符的 `TOTP_ENCRYPTION_KEY`；种子脚本只把 AES-256-GCM 密文写入数据库。完成首次初始化后，应从常驻运行环境移除 bootstrap 密码和 TOTP 明文，只保留密钥管理注入的加密密钥。

## 微信 Live 接入

1. 在企业主体的小程序后台取得 AppID，并将 AppSecret 存入密钥管理。
2. 配置 `api` 为 request 合法域名、`media`/VOD 域名为 download 合法域名，并确保全链路 HTTPS。
3. 将登录 provider 从 Mock 切换为 `jscode2session`，只在服务端调用；session key 不返回客户端、不写日志。
4. 在实际账号内开通激励广告位，填入服务端配置；小程序只获取可公开的广告位 ID。
5. 优先启用平台提供的可信服务端奖励验证。若上线时无可用能力，`client_attestation` 只能用于已批准的小流量灰度，不能宣称已消除作弊。

```dotenv
WECHAT_MODE=live
WECHAT_APP_ID=...
WECHAT_APP_SECRET=secret-manager-reference
WECHAT_REWARDED_AD_UNIT_ID=...
WECHAT_REWARD_VERIFICATION=server_verified
```

## 腾讯云 VOD Live 接入

1. 创建独立子账号和最小权限策略，不使用主账号密钥。
2. 创建 VOD 子应用、转码/截图/内容审核任务流和微信小程序视频发布配置。
3. 配置 `media` 域名、HTTPS、Key 防盗链和回调地址。
4. 浏览器上传签名只由 API 短期签发；签名限制子应用、文件类型、任务流和有效期。
5. VOD 回调必须校验签名和唯一事件 ID；若届时选用的官方回调协议包含可验证时间戳，再同时启用时间窗校验。不得根据浏览器上报直接标记媒体 READY。
6. 播放地址由 API 在活动租约内生成，最长 120 秒，不保存长期签名 URL。

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

## 生产启动闸门

当前代码中的腾讯云 VOD 上传/播放与微信激励广告服务端验证尚未接入真实账号，因此 `NODE_ENV=production` 会无条件安全拒启，release gate 也会包含 `LIVE_PROVIDER_IMPLEMENTATION_REQUIRED`。以下检查清单是完成真实 provider 后必须保留的第二层闸门，不是把配置值改成 `live` 即可绕过的开关。

`NODE_ENV=production` 时，API 必须验证：

- 微信和 VOD 均为 Live provider；
- 企业主体、小程序备案、微信类目和广告准入四项均为 `true`；
- JWT、管理员初始密码、微信、VOD 和播放签名配置不是示例值；
- `ADMIN_ORIGIN` 和公开 API 均为 HTTPS；
- 客户端证明模式没有被误用于未经批准的外部流量。

任意条件失败应使进程退出，而不是只打印警告后继续运行。
