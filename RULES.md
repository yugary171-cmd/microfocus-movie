# 微焦短剧工程规范

本文定义当前仓库的工程约定。业务目标以 `docs/` 为准，实际完成度以 `docs/status.md` 为准；不得把目标设计描述为已经实现。

## 1. 事实来源

- 业务、安全和一致性不变量：`docs/architecture.md`。
- 当前实现进度和已知缺口：`docs/status.md`。
- 已实现的共享路由、类型、枚举和常量：`packages/contracts`。
- 目标页面/API 契约：`docs/pages-and-apis.md`；其中尚未实现的能力需先进入 contracts 再实现。
- API 环境变量：`apps/api/src/config/env.ts`；管理端和观看端构建配置分别由 Vite/runtime 配置管理。
- 数据模型：`apps/api/prisma/schema.prisma`。

## 2. 后端

- 使用 NestJS、Prisma 和 TypeScript；按现有领域模块组织代码，不跨领域直接复制状态迁移或账本规则。
- HTTP DTO 沿用 Nest `class-validator` 与全局 `ValidationPipe`；Zod 当前用于环境变量。改变校验体系必须作为独立迁移，不在单个功能中混用。
- 所有外部输入均需校验和长度限制；provider 回调还必须执行验签、事件去重和重放保护。
- 奖励发放、权益消费、补偿、adjustment、租约结算及其他多记录一致性操作必须使用数据库事务、唯一约束和条件更新。
- 需要幂等的副作用包括奖励完成、人工补偿、provider 回调、回调重放和批量纠错。普通编辑接口不强制使用 `Idempotency-Key`，但重试语义必须明确。
- 使用稳定业务错误码和统一错误响应；不得返回堆栈、数据库原始错误、秘密或完整外部载荷。
- 服务端执行角色、所有权和状态校验；前端按钮与路由不是权限边界。

## 3. 前端

- Vue 页面和组件使用 TypeScript 与 Composition API；保持现有状态管理方式，确有跨页面共享需求时再评估状态库。
- uni-app 通过 `src/platform` 隔离微信专有能力；H5/App 不复用微信登录和广告完成证明。
- API 请求通过统一 client/service 层；集中处理认证失效、标准错误、网络异常和重试限制。
- 缺少 Live API 配置时外部构建必须失败，不能静默切换 Mock；Demo 媒体不得进入外部构建物。
- 对缺失、空数组、过期状态和部分响应提供显式空态或错误态。

## 4. Contracts

- 新增或修改前后端交互时，先更新 `packages/contracts` 中的路由、类型和稳定枚举，再实现服务端与客户端。
- contracts 保持平台无关，不依赖 NestJS、Vue、Node.js 运行时或未被仓库采用的 schema 库。
- 破坏性契约变更需要版本化或兼容窗口；不能让两套客户端分别维护不同业务规则。

## 5. 数据与迁移

- 生产迁移采用 expand/contract 或经批准的兼容方案；禁止用数据库恢复替代普通版本回滚。
- grant 的来源、初始秒数、剧目和过期时间不可修改；当前 `remainingSeconds` 是事务内维护的物化余额，可通过条件更新递减并必须能够对账。
- debit、回调、审核和审计事实采用追加记录；目标 adjustment 实现后同样只追加纠错事实。
- 删除、匿名化和保留按隐私/数据保留矩阵执行，不使用“一律软删除”代替注销和法定清理。

## 6. 依赖、测试与质量

- 新依赖必须说明现有依赖为何不能满足、运行端影响和维护风险，并通过包管理器安装。
- 按改动风险执行最小充分验证：优先运行相关 workspace 的 typecheck 和测试；跨 workspace、契约、数据库或发布候选变更运行 `npm run check`。
- 当前仓库尚未配置有效 lint 实现，不能把 `npm run lint` 当作已生效门禁；引入 lint 前需明确规则、存量基线和 CI 行为。
- 不删除或削弱测试来换取通过；新增边界、状态机、并发或安全行为必须包含相应回归测试。
