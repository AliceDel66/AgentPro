# Codex 代码审查报告与后续开发计划

## 基本信息

- 项目名称：AgentPro
- 审查方：Codex
- 审查日期：2026-06-18
- 当前分支：feature/agentpro-backend
- 审查范围：前端 React/Tauri、后端 FastAPI、Runner 执行链路、Review 评审链路、需求访谈流式链路、鉴权与模型配置
- 审查方式：静态代码审查 + 自动化检查 + 关键业务链路追踪

## 审查结论摘要

当前代码已经具备 AgentPro 的主要产品骨架：登录注册、模型配置、需求访谈、AgentSpec、开发调度、Runner、自动评审、流式对话和桌面端壳层都已经形成闭环。自动化测试与构建也能通过，说明当前实现可以继续作为本地开发基线。

但当前版本还不适合进入真实多用户测试或开放真实 Runner 能力。核心原因不是页面完整度，而是安全边界和执行链路还没有工程化闭环：

- DevJob 可以引用未校验 ownership 的 requirement/spec，这是当前最高优先级安全问题。
- Tauri Runner 命令桥仍接受前端传入路径，桌面端本地文件边界不足。
- Runner 的 `parallel` 策略当前不是并行，执行接口也会同步阻塞。
- AgentSpec 和 Review 页面存在“打开页面即创建新记录”的隐式写入问题。
- 流式模型调用缺少超时、取消和资源释放策略。

最终判断：

- 可以继续本地开发：是。
- 可以给 Claude 进行互审：是。
- 可以接入真实 Codex/Claude Code 做长任务试跑：只建议在本机测试账号、受控仓库和非敏感目录中进行。
- 可以开放给真实用户使用：暂不建议。
- 下一步最优先事项：修复 DevJob 关联资源的用户权限校验。

## 自动化检查基线

本次审查前已完成以下检查：

```bash
backend/.venv/bin/python -m pytest backend/tests
backend/.venv/bin/python -m ruff check backend/app backend/tests
npm run typecheck
npm run build
```

结果：

- 后端测试：42 passed
- 后端 Ruff：通过
- 前端 TypeScript：通过
- 前端构建：通过

说明：自动化检查通过只能证明当前测试覆盖内没有失败，不能覆盖权限隔离、真实 Runner 并发、长连接稳定性、桌面端命令边界等高风险路径。

## 审查覆盖与未覆盖范围

已覆盖：

- 后端 API 路由、核心 service、schema、db model、测试用例。
- 前端服务层、Zustand 用户状态、主要页面跳转和页面副作用。
- Tauri 命令桥的参数边界。
- Runner 从创建任务到执行、产物回传、监控展示的主路径。
- Review 从 artifact 到 findings/report 的主路径。
- 流式对话从前端 SSE 到后端模型调用的主路径。

未覆盖：

- 没有执行真实 Codex/Claude Code 长时间开发任务。
- 没有使用真实腾讯云 SMTP 发信。
- 没有连接生产级公网部署环境做压测。
- 没有做浏览器自动化视觉回归。
- 没有做外部安全扫描或依赖漏洞扫描。

因此本报告的结论适合作为代码级审查与下一阶段开发计划，不应替代上线前的安全审计、压测和真实桌面端 QA。

## 风险优先级矩阵

| 编号 | 等级 | 问题 | 主要影响 | 首要修复点 | 验收信号 |
| --- | --- | --- | --- | --- | --- |
| R1 | P0 | DevJob 缺少 requirement/spec ownership 校验 | 多用户数据泄露、Runner prompt 泄露需求内容 | `backend/app/modules/runner/router.py` | 跨用户 spec/requirement 创建 job 全部失败 |
| R2 | P1 | Tauri 命令桥路径边界不足 | 本地文件被 CLI 误读、非受控目录执行 | `src-tauri/src/lib.rs` | 绝对路径、symlink escape、workspace 外路径全部拒绝 |
| R3 | P1 | Runner 执行同步阻塞，parallel 不是真并行 | 长任务卡 UI、监控无实时价值、并行卖点失效 | `backend/app/modules/runner/executor.py` | Codex/Claude 两路任务可同时 running，日志实时更新 |
| R4 | P1 | AgentSpec 生成不是幂等操作 | 反复进页面产生重复草案，需求状态漂移 | `src/pages/workspace/SpecPage.tsx` | 反复进入 Spec 页不新增版本 |
| R5 | P2 | 流式 LLM 无超时和取消保护 | 模型挂起时占用连接，用户无限等待 | `backend/app/modules/requirements/ai_service.py` | 上游无响应可超时并返回结构化错误 |
| R6 | P2 | 登录态 bootstrap 不完整 | 刷新后用户状态与路由不同步 | `src/App.tsx` | 刷新页面仍保持正确用户；token 失效清空旧状态 |
| R7 | P2 | Review 页重复创建报告 | 报告重复、accept/rework 状态分散 | `src/pages/workspace/ReviewPage.tsx` | 同一 job/spec 默认复用 latest report |
| R8 | P3 | Runner 可用状态硬编码 | 用户误判本地 CLI 可用性 | `src/pages/workspace/SettingsPage.tsx` | 设置页展示真实 CLI 检测结果 |

## 修复排序原则

1. 先修数据隔离，再修用户体验。
2. 先修本地命令边界，再扩大真实 Runner 使用范围。
3. 先保证任务可恢复和可观察，再追求并行执行速度。
4. 先消除页面隐式写操作，再做复杂版本管理。
5. 每个阶段必须能独立测试、独立提交、独立回滚。

## 问题关闭标准

每个问题从“发现”到“关闭”必须满足以下条件：

1. 有明确代码改动或明确确认无需改动的证据。
2. 有对应自动化测试，或说明为什么只能手动验收。
3. 前后端契约变化已经同步。
4. `docs/AgentPro后端开发进度.md` 或 `docs/AgentPro开发进度.md` 已更新。
5. 本报告对应问题已补充状态、commit hash 和验证结果。

建议状态格式：

```md
状态：已修复
修复 commit：<hash> <中文 commit message>
验证：
- <命令或手动验收步骤>
残余风险：
- <如无则写“暂无已知残余风险”>
```

## P1：架构地图

### 前端边界

- 技术栈：React + TypeScript + Vite + HeroUI + Tailwind + Zustand + Tauri
- 入口：
  - `src/App.tsx`
  - `src/services/apiClient.ts`
  - `src/stores/authStore.ts`
- 核心页面：
  - 登录注册与初始化：`src/pages/auth/*`、`src/pages/setup/SetupPage.tsx`
  - 需求访谈：`src/pages/workspace/ChatPage.tsx`
  - AgentSpec：`src/pages/workspace/SpecPage.tsx`
  - 需求库：`src/pages/workspace/LibraryPage.tsx`
  - 开发调度：`src/pages/workspace/DispatchPage.tsx`
  - 并行监控：`src/pages/workspace/MonitorPage.tsx`
  - 自动评审：`src/pages/workspace/ReviewPage.tsx`
  - 设置：`src/pages/workspace/SettingsPage.tsx`
- 桌面端命令边界：
  - `src-tauri/src/lib.rs`

### 后端边界

- 技术栈：FastAPI + SQLAlchemy async + Alembic + MySQL + Redis + LangGraph/LLM service + Docker
- 入口：
  - `backend/app/main.py`
  - `backend/app/core/config.py`
- 核心模块：
  - 鉴权：`backend/app/modules/auth`
  - 模型配置：`backend/app/modules/models`
  - 需求访谈与 AgentSpec：`backend/app/modules/requirements`
  - Runner 开发任务：`backend/app/modules/runner`
  - 自动评审：`backend/app/modules/review`
  - 数据模型：`backend/app/db/models.py`

### 强依赖

- 用户身份隔离依赖 JWT 中的 `sub`
- 需求、AgentSpec、DevJob、Review 之间依赖数据库外键和业务层 ownership 校验
- Runner 依赖本地 Codex/Claude CLI，以及受控 workspace
- 流式体验依赖 OpenAI-compatible streaming response
- 模型配置依赖后端加密存储 API Key，前端只展示保存状态

### 当前高风险边界

- DevJob 创建时的 requirement/spec ownership 校验不足
- Tauri 命令桥允许前端传入路径，路径约束不足
- Runner 执行接口仍是同步阻塞模式
- AgentSpec 和 Review 创建缺少幂等保护
- 流式 LLM 调用没有超时保护

## P2：关键路径追踪

### 路径 1：创建开发任务到 Runner 执行

1. 用户在 `DispatchPage.tsx` 选择 strategy 并点击开始开发。
2. 前端调用 `startRunnerJob` 创建 DevJob。
3. 后端 `POST /api/v1/dev-jobs` 在 `runner/router.py` 中创建任务。
4. 前端随后调用 `executeRunnerJob`。
5. 后端 `POST /api/v1/dev-jobs/{id}/execute` 同步执行 `execute_dev_job`。
6. `executor.py` 读取 requirement/spec，构造 prompt。
7. 按 strategy 调用 Codex 或 Claude CLI。
8. 执行结果写入 `dev_job_events` 和 `dev_job_artifacts`。
9. 前端跳转或进入 Monitor 页面读取任务结果。

压力点：

- DevJob 创建时未验证 `requirementId/specId` 所属权。
- `execute` 接口同步阻塞，无法支撑真实长任务。
- `parallel` 策略当前是顺序执行，不是真并行。
- Monitor 当前不是实时订阅，而是读取一次快照。

### 路径 2：AgentSpec 页面生成草案

1. 用户进入 `SpecPage.tsx`。
2. 页面 effect 直接调用 `generateAgentSpec(requirementId)`。
3. 后端 `POST /requirements/{id}/spec/generate` 每次都会创建新 AgentSpec 版本。
4. 后端把 requirement 状态更新为 `spec_draft`。
5. 用户反复进入页面会持续生成新草案。

压力点：

- 页面访问行为被绑定成写操作。
- 后端生成接口不是幂等的。
- 需求状态可能被页面访问回退。

### 路径 3：对话 token 级流式

1. 前端通过 `apiPostStream` 发起 SSE/stream 请求。
2. 后端 `requirements/router.py` 创建用户消息并启动流式响应。
3. `ai_service.py` 使用 OpenAI-compatible streaming API。
4. chunk 持续返回给前端。
5. 流结束后后端写入 assistant message 和 graph state。

压力点：

- 上游流式请求 `timeout=None`。
- 整个流式过程中持有 DB session。
- 上游模型挂起时，用户会看到无限等待，后端连接也会被占用。

## P3：设计决策判断

当前代码的方向是正确的：先用 FastAPI 提供状态、审计、任务、评审、模型配置能力，桌面端负责本地 Runner 和用户体验。这符合 AgentPro 的产品定位：云端负责可恢复流程和审计，本地负责调用 Codex/Claude Code 开发。

需要保留的核心不变量：

- 后端不能直接暴露或回显 API Key。
- LLM 输出必须经过结构化 schema 校验后再入库。
- Runner 不能变成任意 shell 执行器。
- 多用户数据必须通过 user ownership 隔离。
- 开发任务、评审报告、AgentSpec 需要可审计、可追溯。

当前最先失败的 10x 扩展点：

- 多用户数据隔离会先出问题，尤其是 DevJob 关联其他用户 spec 的路径。
- 长任务同步执行会先拖垮 API worker 和前端交互。
- Runner 工作目录如果不隔离，会导致本地文件误读、误删或越权访问。
- 流式无超时会在模型供应商不稳定时耗尽连接资源。

因此后续开发优先级应从“功能继续堆叠”调整为“安全边界和执行链路工程化”。

## 主要问题清单

### P0：DevJob 缺少 requirement/spec 所属权校验

状态：已修复（Claude 复核并实施）
修复 commit：修复开发任务关联资源的用户权限校验
验证：
- backend/.venv/bin/python -m pytest backend/tests（46 passed，含 4 项新增越权回归用例）
- backend/.venv/bin/python -m ruff check backend/app backend/tests
- npm run build
关键改动：
- `runner/router.py` 新增 `resolve_owned_targets`，创建 DevJob 时校验 requirement/spec 存在且属当前用户，两者同传必须匹配，且至少需一个目标。
- `runner/executor.py` 的 `load_spec_for_job`/`load_requirement_for_job` 仅返回属于 `job.user_id` 的资源（防御式）。
- `review/router.py` 经 `job.spec_id` 反查 spec 时再次校验所属用户。
残余风险：
- 暂无已知残余风险；executor 与 review 均已加防御式校验，跨用户引用在创建入口即被拒绝。

位置：

- `backend/app/modules/runner/router.py`
- `backend/app/modules/runner/executor.py`
- `backend/app/modules/review/router.py`
- `backend/tests/test_runner.py`

问题：

- `POST /api/v1/dev-jobs` 接收 `requirementId` 和 `specId` 后直接写入 DevJob。
- 没有验证对应 requirement/spec 是否存在。
- 没有验证对应 requirement/spec 是否属于当前用户。
- executor 后续会按照 job 中的 `spec_id` 读取 AgentSpec。
- review 在某些路径下也会从 job 推导 spec。
- 当前测试中还存在使用不存在 `specId` 也期望成功的用例。

影响：

- 用户可能构造一个属于自己的 job，但引用其他用户的 AgentSpec。
- 后续 Runner prompt、artifact、review report 可能泄露其他用户需求内容。
- 这是多用户 SaaS 场景下必须优先修复的问题。

建议：

- 创建 DevJob 时必须校验 requirement/spec 存在且属于当前用户。
- `specId` 应通过 `AgentSpec -> Requirement -> user_id` 验证 ownership。
- `requirementId` 和 `specId` 至少需要一个有效目标。
- executor 加防御式校验：读取 spec/requirement 前再次确认 job.user_id。
- review 加防御式校验：不能通过 job 间接读取不属于当前用户的 spec。
- 更新测试：新增跨用户创建 job 失败、跨用户 review-via-job 失败、无效 specId 失败。

### P1：真实开发引擎执行链路同步阻塞，parallel 不是真并行

位置：

- `src/pages/workspace/DispatchPage.tsx`
- `backend/app/modules/runner/router.py`
- `backend/app/modules/runner/executor.py`
- `src/pages/workspace/MonitorPage.tsx`

问题：

- 前端点击开始开发后，立即等待 `executeRunnerJob`。
- 后端 `execute` 接口同步等待完整 CLI 执行结束。
- `parallel` strategy 在 executor 中按 engines 顺序循环执行。
- Monitor 页面只读取一次任务状态，没有真正接入实时事件流。
- running 状态下仍允许再次执行，存在重复执行风险。

影响：

- 真实 Codex/Claude Code 执行可能持续数分钟到数十分钟，前端体验会卡在“启动中”。
- 并行开发卖点没有真实落地。
- 重复执行可能覆盖 workspace 或产生冲突 artifact。

建议：

- `execute` 改为 enqueue/启动后台任务，立即返回 job 状态。
- 后端或桌面端 Runner 按 lease 协议异步领取任务。
- `parallel` 使用真正并发执行，每个 engine 独立 workspace、日志和 artifact。
- Monitor 页面接入 SSE 或轮询，显示实时日志、阶段、心跳、失败原因。
- running 状态下禁止重复 execute，除非显式 retry/restart。

### P1：Tauri 命令桥路径安全不足

位置：

- `src-tauri/src/lib.rs`

问题：

- `safe_path` 只检查是否包含 `..`。
- 没有限制绝对路径。
- 没有 canonicalize 后校验路径是否位于受控 workspace。
- `prompt_path` 和 `workdir` 都可以由前端传入。

影响：

- 如果 renderer 被注入或页面调用边界被绕过，可能让 Codex/Claude CLI 读取任意本地 prompt 文件。
- 可能让 CLI 在非项目目录执行，造成本地文件误操作。

建议：

- 不再让前端传 raw path，改传 jobId/workspaceId。
- Tauri 后端根据 jobId 在受控 runner workspace 内定位文件。
- 对所有路径执行 canonicalize。
- 拒绝绝对路径、symlink escape、workspace 外路径。
- CLI 参数保持白名单，不允许任意 shell 字符串。

### P1：AgentSpec 生成不是幂等操作

状态：已修复（Claude 实施）
修复 commit：修复 AgentSpec 与评审报告重复生成问题
验证：
- backend/.venv/bin/python -m pytest backend/tests（48 passed，含 GET spec 返回最新版本用例）
- npm run build
关键改动：
- `SpecPage.tsx` 默认调用 `getAgentSpec`（读取 latest），打开页面不再生成新版本；无草案时展示空态与显式“生成 AgentSpec 草案”按钮；侧栏新增“重新生成草案”（带确认）。
残余风险：暂无；版本仅由用户显式点击生成时递增。

位置：

- `src/pages/workspace/SpecPage.tsx`
- `backend/app/modules/requirements/router.py`

问题：

- 页面 mount 即调用生成接口。
- 后端每次生成都会创建新 spec version。
- 用户只要反复进入页面，就会产生多份草案。

影响：

- 数据库出现重复 AgentSpec。
- requirement 状态可能被页面访问行为回退。
- 用户难以判断哪个版本是当前有效草案。

建议：

- Spec 页面默认先 `GET latest spec`。
- 没有 spec 时再提示生成。
- 重新生成必须由用户显式点击。
- 后端提供 latest/current spec 查询。
- 可增加唯一约束或当前版本标记，避免版本漂移。

### P2：流式 LLM 调用缺少超时和连接保护

位置：

- `backend/app/modules/requirements/ai_service.py`
- `backend/app/modules/requirements/router.py`

问题：

- stream API 使用 `timeout=None`。
- 流式期间持有 DB session。
- 缺少 heartbeat、取消、上游长时间无响应处理。

影响：

- 模型供应商卡住时，用户体验会无限等待。
- 后端 worker 和 DB session 可能被长时间占用。
- 并发用户增加后会先暴露资源耗尽问题。

建议：

- 设置 connect/read/write/pool timeout。
- 增加 SSE heartbeat。
- 捕获 client disconnect，及时取消上游请求。
- 用户消息和 assistant 消息使用更短事务提交。
- 流式结束后再写 summary/graph state，失败时写入可恢复状态。

### P2：登录态 bootstrap 与 route guard 不完整

位置：

- `src/App.tsx`
- `src/stores/authStore.ts`
- `src/components/layout/AppShell.tsx`

问题：

- App 初始 route 固定为 `login`。
- Zustand 只持久化 user，不统一持久化 session 状态。
- `refreshCurrentUser` 失败后没有清空 token 和 stale user。
- 非登录页面缺少统一 auth guard。

影响：

- 用户刷新后可能被带回登录页。
- token 失效后顶部/侧栏仍可能显示旧用户。
- 未登录状态可能访问部分 workspace shell。

建议：

- App 启动时执行 auth bootstrap。
- token 有效则恢复用户并进入默认 workspace。
- token 无效则清空 user、access token、refresh token。
- workspace 路由统一走 auth guard。

### P2：Review 页会重复创建报告

状态：已修复（Claude 实施）
修复 commit：修复 AgentSpec 与评审报告重复生成问题
验证：
- backend/.venv/bin/python -m pytest backend/tests（48 passed，含 /reviews/latest 读取与跨用户隔离用例）
- npm run build
关键改动：
- 后端新增 `GET /reviews/latest?jobId=&specId=`，按 user_id 过滤返回最新报告或 null。
- `ReviewPage.tsx` 打开时只读 latest，不再自动创建；无报告时展示空态与显式“生成评审报告”按钮；有报告时提供“重新评审”（带确认）。
残余风险：暂无；同一 job/spec 默认复用最新报告，新报告仅由用户显式触发。

位置：

- `src/pages/workspace/ReviewPage.tsx`
- `backend/app/modules/review/router.py`

问题：

- 页面没有 activeReviewId 时会直接创建 review。
- 反复进入页面可能为同一个 job/spec 创建多个报告。

影响：

- 评审报告重复。
- 用户无法明确当前最终报告。
- 后续 rework/accept 状态可能分散在不同 report。

建议：

- 页面优先读取 latest review。
- 后端 create review 对同一 job/spec 做幂等处理，或提供 `GET latest review`。
- 用户显式点击“重新评审”时才创建新报告。

### P3：设置页 Runner 可用状态是静态展示

位置：

- `src/pages/workspace/SettingsPage.tsx`

问题：

- Codex Runner 和 Claude Code Runner 显示“可用”是硬编码。
- 没有检测本地 CLI 是否存在、是否登录、是否可执行。

影响：

- 用户可能在不可用环境下以为 Runner 已就绪。

建议：

- Tauri 暴露 runner detection 命令。
- 设置页展示真实检测状态、版本、登录状态、最近错误。

## 后续开发计划

### 后续开发执行纪律

后续无论由 Codex、Claude Code 还是其他 agent 执行，都必须遵守以下规则：

- 每个阶段必须单独开发、单独测试、单独提交。
- 每个 commit message 必须使用中文，并准确描述完成内容。
- 每个阶段完成后必须更新 `docs/AgentPro后端开发进度.md`。
- 如果阶段涉及前端页面或服务层，也必须同步更新 `docs/AgentPro开发进度.md`。
- 如果阶段修复了本报告中的问题，需要在本文件对应问题下补充“状态：已修复”和 commit hash。
- 不允许把 P0 安全修复、Runner 架构改造、UI 调整混在一个 commit。
- 每次提交前必须确认没有提交 `.env`、数据库密码、SMTP 密钥、API Key、服务器密码、真实用户数据、构建缓存。

建议每个阶段的提交前检查顺序：

```bash
git status --short
backend/.venv/bin/python -m pytest backend/tests
backend/.venv/bin/python -m ruff check backend/app backend/tests
npm run typecheck
npm run build
git diff --cached
```

如果某个阶段只修改前端或只修改后端，可以说明跳过不相关检查的原因，但不能无说明跳过所有检查。

### 阶段总览

| 阶段 | 优先级 | 主题 | 必须同步前端 | 必须同步后端 | 主要验证 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | DevJob 所属权校验 | 视接口错误提示调整 | 是 | runner/review 权限回归测试 |
| 2 | P1 | Tauri 命令桥安全 | 是 | 可能不需要 | Tauri build、路径逃逸测试 |
| 3 | P1 | 真实并行 Runner 与监控 | 是 | 是 | parallel job 实时日志验收 |
| 4 | P1 | AgentSpec 与 Review 幂等 | 是 | 是 | 反复进入页面不新增记录 |
| 5 | P2 | 流式链路稳定性 | 是 | 是 | 超时、断连、错误 event 验收 |
| 6 | P2 | 登录态与全局状态闭环 | 是 | 可能不需要 | 刷新、token 失效、路由保护 |

### 阶段 1：P0 安全边界修复

目标：

- 修复 DevJob 与 AgentSpec/Requirement 的多用户隔离问题。
- 为后续真实 Runner 执行打好安全基础。

任务：

1. 新增 runner target 校验 helper：
   - 校验 requirement 是否存在且 `user_id == current_user.id`
   - 校验 spec 是否存在且其 requirement 属于当前用户
   - 校验 spec 与 requirement 同时传入时是否互相匹配
2. 修改 `POST /api/v1/dev-jobs`：
   - 无效 requirement/spec 返回 404 或 403
   - `requirementId/specId` 不能全部为空
3. executor 防御式校验：
   - 根据 job.user_id 加载 requirement/spec
   - 加载失败时终止任务并写入失败 event
4. review 防御式校验：
   - 不允许通过 job 间接读取越权 spec
5. 更新测试：
   - 跨用户 specId 创建 job 失败
   - 跨用户 requirementId 创建 job 失败
   - 不存在 specId 创建 job 失败
   - review-via-job 不能越权读取 spec

验收：

```bash
backend/.venv/bin/python -m pytest backend/tests/test_runner.py backend/tests/test_review.py
backend/.venv/bin/python -m pytest backend/tests
npm run typecheck
npm run build
```

建议 commit：

```bash
git commit -m "修复开发任务关联资源的用户权限校验"
```

### 阶段 2：Tauri 命令桥安全加固

目标：

- 防止桌面端 Runner 被滥用为任意路径/任意命令执行器。

任务：

1. `start_agent_runner` 不再接收任意 `prompt_path/workdir`。
2. 改为接收后端 jobId 或本地受控 workspace id。
3. 对 workspace 路径 canonicalize。
4. 强制路径位于 app runner workspace。
5. 拒绝 symlink escape。
6. 为 path guard 增加 Rust 单元测试。

验收：

```bash
npm run tauri build
npm run typecheck
npm run build
```

建议 commit：

```bash
git commit -m "加固 Tauri Runner 命令桥路径安全"
```

### 阶段 3：真实并行 Runner 与监控链路

目标：

- 让 Codex/Claude Code 真正异步执行、并行执行、实时可见。

任务：

1. 后端 `execute` 改为异步启动或只创建待领取任务。
2. 桌面端通过 lease 领取任务执行。
3. `parallel` 策略为每个 engine 创建独立执行上下文。
4. 每个 engine 单独写入 stage、stdout、stderr、artifact。
5. Monitor 页面接入实时 stream 或定时 polling。
6. running 状态禁止重复 execute。
7. 增加超时、失败重试、取消任务能力。

验收：

```bash
backend/.venv/bin/python -m pytest backend/tests/test_runner.py
npm run typecheck
npm run build
```

手动验收：

- 创建一个 parallel job。
- Codex 和 Claude 两条候选任务能同时进入 running。
- Monitor 页面能看到两路日志持续刷新。
- 任一路失败不会覆盖另一条结果。

建议 commit：

```bash
git commit -m "完成真实并行 Runner 执行与实时监控"
```

### 阶段 4：AgentSpec 与 Review 幂等改造

目标：

- 页面访问不再产生隐式写操作。
- 避免重复 AgentSpec 和重复 Review。

任务：

1. 新增 latest spec 查询接口。
2. Spec 页面默认读取 latest spec。
3. 重新生成 spec 改为显式按钮操作。
4. 新增 latest review 查询接口。
5. Review 页面默认读取最新报告。
6. 重新评审改为显式按钮操作。
7. 后端 create review 支持幂等或明确创建新版本。

验收：

```bash
backend/.venv/bin/python -m pytest backend/tests/test_requirements.py backend/tests/test_review.py
npm run typecheck
npm run build
```

手动验收：

- 反复进入 Spec 页面不会新增 spec version。
- 反复进入 Review 页面不会新增 report。

建议 commit：

```bash
git commit -m "修复 AgentSpec 与评审报告重复生成问题"
```

### 阶段 5：流式链路稳定性

目标：

- 让 token 级流式在真实模型供应商异常时可恢复、可失败、可提示。

任务：

1. 为 stream 请求配置合理 timeout。
2. 增加 SSE heartbeat。
3. 增加 client disconnect 处理。
4. 流式错误返回结构化 error event。
5. DB session 不跨整个远程流式过程长时间持有。
6. 失败时保留用户消息和失败状态。

验收：

```bash
backend/.venv/bin/python -m pytest backend/tests/test_requirements.py
npm run typecheck
npm run build
```

手动验收：

- 模型服务断开时，前端能显示明确失败信息。
- 模型长时间无响应时，后端能超时释放资源。

建议 commit：

```bash
git commit -m "增强需求对话流式输出的超时与错误处理"
```

### 阶段 6：登录态与全局状态闭环

目标：

- 让用户信息、顶部栏、侧栏、设置页、登录态在刷新和 token 失效时保持一致。

任务：

1. App 启动时执行 auth bootstrap。
2. 有 refresh token 时自动刷新 access token。
3. `/auth/me` 成功后写入 Zustand。
4. `/auth/me` 失败后清理 user 和 token。
5. workspace 页面统一 auth guard。
6. 顶栏、侧栏、设置页只从 Zustand 读取用户信息。

验收：

```bash
npm run typecheck
npm run build
```

手动验收：

- 登录后刷新页面仍显示正确用户。
- token 失效后不会显示旧用户。
- 未登录访问 workspace 会回到登录页。

建议 commit：

```bash
git commit -m "完善登录态恢复与全局用户状态同步"
```

## 给 Claude 互审的重点

### 互审方式

建议后续采用“三文档闭环”：

1. Codex 维护本文档：`docs/Codex代码审查报告与后续开发计划.md`
2. Claude 单独产出：`docs/Claude代码审查报告与修复建议.md`
3. 最终合并结论：`docs/AgentPro交叉审查结论.md`

互审时不要直接覆盖对方报告。Claude 如果不同意本文判断，应在自己的报告中写清：

- 不同意的问题编号，例如 R1、R2。
- 不同意的理由。
- 对应代码证据。
- 建议的替代修复方案。
- 需要 Codex 复核的具体文件或测试。

Codex 复审 Claude 报告时，也按同样格式补充结论，最终再形成合并结论。

### Claude 优先复查问题

建议让 Claude 重点复查以下方向：

1. DevJob、AgentSpec、Requirement、Review 四者之间是否还有隐藏越权路径。
2. Runner workspace 删除、复制、worktree fallback 是否可能误删用户文件。
3. Tauri command 是否还有 renderer 到本机 CLI 的越权入口。
4. `parallel` 执行改造后是否会产生 artifact 覆盖、日志串线、状态竞争。
5. 流式接口在浏览器断开、模型超时、后端重启时是否能留下可恢复状态。
6. 自动评审报告是否会过度信任 runner artifact 中的用户生成内容。

### Claude 复查建议命令

```bash
git status --short
backend/.venv/bin/python -m pytest backend/tests
backend/.venv/bin/python -m ruff check backend/app backend/tests
npm run typecheck
npm run build
rg -n "specId|requirementId|user_id|execute_dev_job|start_agent_runner|timeout=None" backend src src-tauri
```

### 互审判定口径

- 如果 Codex 与 Claude 都判定为 P0，则必须优先修复，不进入其他功能开发。
- 如果只有一方判定为 P0，另一方判定为 P1/P2，需要先做一次代码证据复核。
- 如果问题没有测试覆盖，不能仅凭“手动看起来正常”关闭。
- 如果问题涉及本地命令执行、密钥、用户数据、跨用户访问，默认按更高风险处理。
- 如果修复引入接口变更，必须同步更新前端服务层和相关页面。

## 当前不建议优先做的事情

- 不建议继续优先增加新页面。
- 不建议先部署公网生产环境。
- 不建议在 Runner 安全边界修好前开放真实用户使用。
- 不建议把 Codex/Claude 执行放到云服务器直接跑，除非补完整沙箱和隔离策略。

## 下一刀

建议优先切 `DevJob 所属权校验与回归测试`。

理由：

- 这是当前最明确的 P0 安全问题。
- 修复范围集中在 runner/review 入口和测试。
- 不依赖大规模 Runner 架构重构。
- 修复后才能安全推进真实并行执行。

入口：

- `backend/app/modules/runner/router.py`
- `backend/app/modules/runner/executor.py`
- `backend/app/modules/review/router.py`
- `backend/tests/test_runner.py`
- `backend/tests/test_review.py`
