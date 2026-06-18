# AgentPro 后续开发计划

> 制定日期：2026-06-18
> 配套文档：[AgentPro安全审查与现行阶段修复.md](./AgentPro安全审查与现行阶段修复.md)
> 适用分支：`feature/agentpro-backend` / `feature/agentpro-desktop`

---

## 一、当前状态盘点

### 已具备
- **认证**：邮箱验证码注册、密码登录、JWT access + 旋转式 refresh token、`/auth/me`，密码用 argon2 哈希。
- **模型配置**：Provider/BaseURL/Key 配置、连接测试、模型列表拉取，API Key 加密入库（Fernet）。
- **需求访谈闭环**：需求创建 → LangGraph 需求图谱（可调真实模型，失败回退规则）→ 反问确认 → AgentSpec 生成/审批/归档，归属校验完整。
- **开发调度 / 监控 / 评审**：DevJob 任务记录、事件/产物记录、SSE 事件回放、启发式评审报告。
- **前端**：登录/注册/找回壳、模型配置向导、工作区 8 个页面，已接入真实 API；本轮补齐了对话动画与全站 loading。

### 主要缺口（决定下一步优先级）
1. **安全**：见审查文档 C1/H1~H3/M1~M3 —— 上线前必须处理。
2. **执行引擎是脚手架**：DevJob 仅落库，**未真正驱动 Codex / Claude Code 执行**；评审分数为启发式公式而非真实静态分析/测试结果。
3. **实时性**：SSE 仅一次性回放已存事件，非真正流式；对话为整段返回，非 token 级流式。
4. **功能假象**：找回密码、设置页账号信息、部分 mock fallback 尚未接真实数据。

---

## 二、路线图总览

| 阶段 | 主题 | 目标 | 预估 |
| --- | --- | --- | --- |
| **P0** | 安全加固 | 修复审查文档全部 🔴🟠🟡 项，达到「可对外部署」基线 | 3–5 天 |
| **P1** | 功能补全与一致性 | 消除功能假象、补齐真实数据与 token 续期 | 5–8 天 |
| **P2** | 核心能力落地 | 真正驱动开发引擎 + 真实评审 + 流式体验 | 2–4 周 |
| **P3** | 质量与运维 | 测试覆盖、CI/CD、可观测性、无障碍与多端 | 持续 |

---

## 三、P0 · 安全加固（上线阻塞项）

> 逐条对应审查文档编号，完成后逐项勾除。

- [ ] **C1** 轮换并迁出全部生产凭据（RDS / JWT / SMTP），改用环境变量或 KMS 注入。
- [ ] **H1** `get_settings()` 启动校验：非 local/test 环境若 JWT 密钥缺省或 <32 字节则拒绝启动。
- [ ] **H2** 引入独立 `AGENTPRO_SECRET_ENC_KEY`，与 JWT 密钥分离；编写一次性重加密迁移脚本。
- [ ] **H3** 出站请求 SSRF 防护：对模型 `base_url` 做地址解析 + 私有/保留/回环地址黑名单 + 仅 https + 响应大小限制。
- [ ] **M1** 基于 Redis 的登录限速与失败锁定（IP + 账号滑动窗口）。
- [ ] **M2** 评审创建补 spec 归属校验。
- [ ] **M3** `api_host`/`docs_enabled` 按环境取默认值（本地 127.0.0.1 + 文档开，生产 0.0.0.0 + 文档关）。
- [ ] **配套** `.gitignore` 增补 `backend/*.db`；新增依赖与 `.env.example` 字段同步更新部署文档。

**验收**：`pytest` 全绿 + 新增安全用例（伪造 token 被拒、内网 base_url 被拒、越权 specId 返回 404、登录限速生效）。

---

## 四、P1 · 功能补全与一致性

- [ ] **找回密码闭环**（对应 L3）
  - 后端：复用 `email_verification_codes`（`purpose="reset"`），新增 `POST /auth/password-reset/request` 与 `POST /auth/password-reset/confirm`。
  - 前端：`ForgotPasswordPage` 接入真实 API，加入验证码冷却与 loading（复用本轮组件）。
- [ ] **设置页真实账号信息**（对应 L4）：接 `/auth/me`，展示真实用户名/邮箱/验证状态，移除「张明」等硬编码。
- [ ] **Token 自动续期**（对应 L2）：`apiClient` 在 401 时用 refresh token 自动续签并重放原请求，失败再跳登录。
- [ ] **令牌存储加固**（对应 M4）：Tauri 安全存储保存 refresh token，access token 仅驻内存。
- [ ] **Mock 开关治理**（对应 L6）：`VITE_AGENTPRO_MOCK_API` 仅限开发，生产构建禁用并在控制台显著告警。
- [ ] **审计日志落地**（对应 L7）：审批、开发启动、评审采纳、密钥变更等高风险动作写入 `audit_logs`。

**验收**：找回密码端到端可用；刷新页面/令牌过期后无需重新登录；设置页显示真实用户。

---

## 五、P2 · 核心能力落地

> 这是产品从「演示闭环」走向「真正可用」的关键阶段。

### 5.1 开发引擎真实执行
- [ ] 设计 Runner 执行层：将 DevJob 投递到真实的 Codex / Claude Code 工作流（隔离工作区、拉取 AgentSpec、执行、回传事件/产物）。
- [ ] 任务队列与租约：当前已有 `lease_owner/lease_expires_at` 字段，补齐 worker 抢占、超时续租、失败重试与取消。
- [ ] 产物管理：代码 diff / 测试结果 / 日志的存储与回链（`dev_job_artifacts.uri`）。

### 5.2 真实评审
- [ ] 用真实静态分析、测试通过率、安全扫描结果替换 `review/router.py` 的启发式打分公式。
- [ ] 「合并优点」按钮落地（当前为占位）。

### 5.3 流式体验
- [ ] 对话改为 token 级流式（后端 SSE/分块透传上游模型流，前端 `TypewriterText` 直接消费真实流而非整段回填）。
- [ ] 监控页 SSE 改造（对应 L1）：真正实时推送 worker 事件，解决 `EventSource` 无法带鉴权头的问题（query 一次性票据或 fetch streaming）。

**验收**：从需求 → AgentSpec → 真实开发 → 真实评审 → 采纳的端到端链路可在真实模型与引擎上跑通。

---

## 六、P3 · 质量与运维

- [ ] **测试**：后端补安全用例与并发租约用例；前端引入组件测试（Vitest + Testing Library），覆盖 loading/打字机/错误态。
- [ ] **CI/CD**：PR 流水线跑 `ruff` + `pytest` + `tsc` + `vite build`；镜像构建扫描密钥泄露（gitleaks）。
- [ ] **可观测性**：结构化日志、请求追踪、关键指标（登录成功率、模型调用时延/失败率、任务时长）。
- [ ] **无障碍 / 体验**：本轮已加 `prefers-reduced-motion` 与 `aria-busy`，继续做键盘可达性、焦点管理、错误重试入口。
- [ ] **多端**：明确 Tauri 桌面与潜在 Web 部署的配置差异（CORS、令牌存储、SSE 策略）。

---

## 七、近期两周建议排序

1. P0 全部（安全是上线阻塞项）。
2. P1：Token 自动续期 + 设置页真实用户 + 找回密码（用户最易感知的「功能假象」）。
3. P2 起步：先做对话 token 级流式（体验提升最直接，且本轮打字机组件已为其铺好前端基础）。

---

## 附：本轮已交付（详见安全审查文档第三节）
- 需求一：对话思考动画 + 打字机效果。
- 需求二：全站 loading 效果（新增 Spinner / LoadingState / TypingIndicator / Typewriter 组件，AppButton 支持 loading）。
- 顺带修复：后端测试隔离（不再连真实 SMTP，14/14 通过）。
