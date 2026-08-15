# 数据保留矩阵（未批准）

- 状态：`RETENTION_MATRIX_APPROVED=false`
- 批准人：产品 + 法务/隐私 + 工程（待填写）
- 批准日期 / 法律依据：待填写
- 本文件只列数据类和处置动作，**不填写未确认的保存天数**

| 数据类 | 例子 | 批准前 | 批准后 |
| --- | --- | --- | --- |
| 用户资料 | displayName、avatarUrl、signature、gender、openId | 只撤权 | 匿名化为 `已注销用户` / `deleted:{userId}`；签名清空、性别 `unset` |
| 观看进度 | WatchProgress | 不删除 | 删除 |
| 权益账本 | grant / debit / adjustment | 保留 | 保留 |
| 广告挑战 | RewardChallenge | 保留 | 保留（补偿核验） |
| 播放租约 | PlaybackLease | 保留 | 保留 |
| 管理审计 | AuditLog、operationalEvent | 保留 | 保留 |
| 回调事件 | CallbackEvent 元数据 | 保留 | 保留；密文按已实现载荷保留期清除 |
| 注销申请 | DeletionRequest 令牌摘要 | 保留 | 保留处理证明 |

后台作业 `deletion-cleanup` 在矩阵未批准时只记账 `DELETION_CLEANUP_BLOCKED`，不清理。把契约常量改为 true 必须随本次批准证据一起提交，不能用环境变量假装已批准。
