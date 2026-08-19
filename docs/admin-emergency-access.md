# 管理员应急恢复（公开规程）

- 文档用途：甲方运维在管理员无法登录时，按可审计流程恢复访问；不是产品隐藏入口，也不是厂商常驻权限
- 更新日期：2026-08-19
- 本文不保存真实邮箱、密码、TOTP 密钥、数据库口令或登录截图

本规程依赖已实现的账号管理、生产启动闸门、种子脚本和全员锁死恢复命令。与代码冲突时以 `apps/api/src/admin/admin-accounts.service.ts`、`apps/api/src/admin/admin-break-glass.ts`、`apps/api/prisma/seed.ts`、`apps/api/src/config/env.ts` 为准。事故分级与审批角色见 [operations.md](./operations.md)；秘密分类见 [configuration.md](./configuration.md)。

## 1. 原则

1. **知情、双人、留痕**：应急恢复由甲方安全负责人和运维共同执行；工单记录事故 ID、批准人、执行人、目标管理员稳定 ID/邮箱（可脱敏）、开始与结束时间。执行人不得兼任唯一批准人。
2. **优先用后台，不用库**：只要仍有一名「健康系统管理员」能登录，就必须走管理端重置，不得直接改库。
3. **一次性、事后收回**：应急凭据只用于恢复；登录成功后立即作废本次使用的密码和 TOTP 明文，并确认生产常驻环境中没有 `ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_TOTP_SECRET`、`ADMIN_TEST_OTP`、`ADMIN_BREAK_GLASS_*`。
4. **不改账本、不硬删账号**：恢复只动 `AdminUser` / `AdminSetupToken` 与必要的审计行；不得借机改 grant、debit、剧目或删除管理员。
5. **工单最小化**：不粘贴密码、OTP、完整 setup URL、JWT、`.env`、SQL 结果中的哈希或密文。

「健康系统管理员」指：`role = ADMIN`、`active = true`、且已完成开通（`setupCompletedAt` 非空）。最后一个健康系统管理员不能通过后台停用、改角色或重置凭据，否则会触发 `LAST_ACTIVE_ADMIN`。

## 2. 禁止事项

- 在应用或前端中增加隐藏账号、万能密码、跳过 TOTP 的测试码、未文档化的登录接口。
- 把 `ADMIN_TEST_OTP` 或 bootstrap 明文留在生产 API 进程环境中；`NODE_ENV=production` 时 API 会因此拒绝启动。
- 对已存在的引导邮箱反复执行 seed 指望改密：生产种子对已存在邮箱执行 `update: {}`，**不会覆盖**密码或 TOTP。
- 把应急密码写进仓库、聊天记录、管理端文案或交付给业务人员的 `.env` 副本。
- 用数据库时间点恢复代替账号恢复（会覆盖合法写入，见 [operations.md](./operations.md) 第 7.8 节）。

## 3. 预防（交付与日常）

上线时由甲方当场完成，不依赖开发机 `.env`：

1. 至少两名系统管理员，密码与验证器分人保管。
2. 开通页展示的 TOTP 密钥/备用信息当场写入甲方保险柜或企业密码柜，不入库、不入 Git。
3. 初始化完成后从常驻环境移除 `ADMIN_BOOTSTRAP_PASSWORD` 与 `ADMIN_BOOTSTRAP_TOTP_SECRET`。
4. 人员离职时由另一名管理员停用账号并视需要重置凭据；周期性核对健康系统管理员人数 ≥ 2。

## 4. 路径 A：仍有健康系统管理员能登录

适用：至少一名健康 `ADMIN` 可完成邮箱 + 密码 + 验证器登录。

1. 事故定级至少 SEV-2（管理面不可用）；全员锁死按 SEV-1。
2. 操作人打开账号管理，对目标账号执行「凭据重置」（需操作人当前 TOTP 与书面原因）。
3. 系统会停用目标账号、清空密码与 TOTP、作废其会话（`sessionVersion` 递增），并给出 24 小时一次性开通链接。
4. 通过受控渠道把链接交给本人（不当场发到公开群）；本人设置新密码并重新绑定验证器。
5. 最后一个健康系统管理员**不能**对自己或使自己不再健康的操作走此路径；此时改用路径 B。
6. 编辑若仍有剧目，重置前须指定在职替换编辑。

成功标准：目标账号完成开通后可用真实 TOTP 登录；旧 JWT 下一请求失效；审计中出现 `ADMIN_CREDENTIAL_RESET_REQUESTED`。

## 5. 路径 B：全员无法登录——官方恢复命令

适用：没有任何管理员能完成邮箱 + 密码 + TOTP 登录；甲方运维能在 API 所用的同一数据库上执行仓库命令。这不是登录页后门，不会出现在管理后台，生产 API 进程也不读取这些变量。

1. IC + 安全负责人批准；建议先停止或隔离生产 API，避免恢复过程中并发改账号。
2. 只在一次性命令环境中提供（不要写入长期运行的 API `.env`）：
   - `ADMIN_BREAK_GLASS_CONFIRM=RESET_ADMIN_ACCESS`
   - `ADMIN_BREAK_GLASS_EMAIL`：要恢复的**已有**系统管理员邮箱（只接受 `ADMIN` 角色）
   - `ADMIN_BREAK_GLASS_PASSWORD`：当场生成的 12–128 位新密码
   - `ADMIN_BREAK_GLASS_REASON`：6–300 字原因（写入审计，不含秘密）
   - `ADMIN_BREAK_GLASS_TOTP_SECRET`：可选；缺省则命令生成新密钥
   - 现有 `DATABASE_URL` 与 `TOTP_ENCRYPTION_KEY`
3. 先干跑，确认目标账号 ID 后，双人在场再提交。根目录命令必须把 `--commit` 放在 `--` 之后，否则 npm 会当成自己的参数：

```bash
ADMIN_BREAK_GLASS_CONFIRM=RESET_ADMIN_ACCESS \
ADMIN_BREAK_GLASS_EMAIL='existing-admin@example.com' \
ADMIN_BREAK_GLASS_PASSWORD='...' \
ADMIN_BREAK_GLASS_REASON='all administrators lost authenticators' \
npm run db:admin-break-glass

ADMIN_BREAK_GLASS_CONFIRM=RESET_ADMIN_ACCESS \
ADMIN_BREAK_GLASS_EMAIL='existing-admin@example.com' \
ADMIN_BREAK_GLASS_PASSWORD='...' \
ADMIN_BREAK_GLASS_REASON='all administrators lost authenticators' \
npm run db:admin-break-glass -- --commit
```

4. `--commit` 会：写入 bcrypt 密码哈希与加密 TOTP、启用账号、完成开通状态、递增 `sessionVersion`（旧 JWT 失效）、作废未使用开通令牌，并写入 `ADMIN_BREAK_GLASS_RECOVERY` 审计/运营事件。标准输出含一次性 `otpauthUri` / `manualKey`，当场扫入验证器后清终端滚动与环境变量。
5. 用新密码 + 新 TOTP 登录后，按路径 A 处理其余账号，并补齐第二名健康系统管理员。
6. 确认常驻 API 环境没有 `ADMIN_BREAK_GLASS_*`、`ADMIN_BOOTSTRAP_PASSWORD`、`ADMIN_BOOTSTRAP_TOTP_SECRET`、`ADMIN_TEST_OTP`。怀疑会话被滥用时再评估轮换 `JWT_SECRET`。

种子脚本不能替代本命令：对已存在邮箱 `seed` 的 `update` 为空，不会改密。不要为恢复去新增隐藏账号。

成功标准：目标邮箱可用新密码 + 新验证器登录；旧会话失效；审计可见 `ADMIN_BREAK_GLASS_RECOVERY`；明文已从环境与终端消除。

## 6. 恢复后检查

- 健康系统管理员不少于两名。
- 登录限频未被本次尝试长期锁死；若被锁，等待窗口结束或由运维按现网限频实现清理桶（须写入工单，禁止关闭限频上线）。
- `GET /health/ready` 正常；抽查审计列表可见恢复相关记录。
- 复盘：谁保管验证器、为何只剩一人、下次演练日期。

## 7. 工单应记录的字段

事故 ID、级别、环境、批准人、执行人、开始/结束（含时区）、路径（A/B）、目标管理员稳定 ID、`sessionVersion` 是否递增、`ADMIN_BREAK_GLASS_*` 是否已从环境移除、残余风险与下次演练。
