export const operationActionMessages = {
  mockBreakerToggled: "演示熔断状态已切换；未影响真实播放服务。",
  mockCompensationGranted: "演示补偿已记入审计视图；未授予真实权益。",
  compensationGranted: "补偿权益已授予。",
  mockAdjustmentRecorded: "演示纠错已记入审计视图；未改真实账本。",
  adjustmentRecorded: "权益纠错已写入账本。",
  adjustmentVoided: "核销事实已追加，用户余额未改动。",
  mockCallbackReplayed: "演示重放已记入审计视图；未解锁或执行真实回调。",
  callbackReplayed: "回调已解锁。若存有未过期的加密载荷，服务端已尝试执行；否则需等待 provider 再次投递。不会复制新的业务事实。",
  mockDeletionTokenReissued: "演示补发已记入审计视图；未签发真实查询令牌，也不能恢复已撤销登录。",
  deletionTokenAlreadyProcessed: "同一幂等键已处理过，不会再次返回查询令牌。",
} as const;
