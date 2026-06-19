# AgentPro 架构与安全分析报告

> 分析人：ZCode（builtin:zai-start-plan/GLM-5.2）
> 日期：2026-06-18
> 分析范围：`feature/agentpro-backend` 分支全量代码（后端 Python + 前端 React + Tauri 桌面端 + Rust Runner）
> 方法：逐文件人工审计，重点覆盖认证、鉴权、密钥、Runner 执行、SSRF、注入、依赖与配置

---

## 一、总体结论

AgentPro 是一个「需求访谈 → AgentSpec → 本地 Runner 执行 → 自动评审」的桌面端 Agent 开发助手。整体架构清晰、分层合理，**安全基础明显好于一般原型项目**——已经在 JWT 密钥强度校验、密钥分离加密、SSRF 防护、CORS、登录限流、租户隔离上做了主动设计。但作为「claude + codex 双手开发」的产物，仍存在若干真实可利用的安全问题与架构隐患，**其中 1 个为高危（P0），需在合并到 `feature/agentpro-desktop` 前修复**。

### 风险概览

| 级别 | 数量 | 代表项 |
|------|------|--------|
| 🔴 P0 高危 | 1 | Runner 事件写入缺乏状态机约束，可伪造任务完成 |
| 🟠 P1 中危 | 4 | jose 已知 CVE、依赖未锁版本、`.env.example` 含 MySQL 真实连接串模板、Runner 工作区路径注入面 |
| 🟡 P2 低危/改进 | 6 | passlib 死依赖、CORS+credentials 配置、限流仅在内存、SQLite 默认并发、Tauri 无 CSP、缺测试覆盖度量 |

---

## 二、项目架构

### 2.1 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + HeroUI + Tailwind + Zustand + Vite 6 |
| 桌面壳 | Tauri 2（Rust） |
| 后端 | FastAPI（async）+ SQLAlchemy 2（async）+ Alembic |
| 数据库 | 默认 SQLite（aiosqlite），生产 MySQL（asyncmy） |
| AI | 用户自配 OpenAI 兼容 `/chat/completions`（支持流式 SSE） |
| Runner | Codex CLI / Claude Code CLI，桌面端本机执行 |
| 认证 | JWT（HS256）access + opaque refresh token，Argon2 哈希 |

### 2.2 后端分层

```
backend/app
├── main.py              # FastAPI 工厂 + CORS
├── api/router.py        # 6 个模块路由聚合
├── core/                # 横切关注点
│   ├── config.py        # pydantic-settings，含密钥强度校验
│   ├── security.py      # 密码哈希、JWT、邮件码
│   ├── crypto.py        # Fernet/MultiFernet 密钥分离 + 轮转
│   ├── ratelimit.py     # 内存滑动窗口限流
│   ├── net.py           # SSRF 防护
│   ├── audit.py         # 审计日志
│   └── responses.py     # 统一 {ok,data,message} 包装
├── db/                  # 模型、会话、Base
└── modules/
    ├── auth/            # 注册/登录/刷新/邮件码/重置密码
    ├── email/           # SMTP
    ├── models/          # 用户模型 Provider 配置（加密存 API Key）
    ├── requirements/    # 需求访谈 graph + AI service（流式）
    ├── review/          # 基于证据的自动评审分析器
    ├── runner/          # DevJob 调度 + 本机/桌面 Runner 执行
    └── health/
```

### 2.3 核心业务流（数据流）

```
用户访谈 ──(messages)──► RequirementGraph / AIRequirementGraph
        │                      │
        │                 AgentSpec（版本化草案 + 审批）
        │                      │
        ▼                      ▼
    DevJob ◄─── runner-package ───► 桌面端 Tauri（execute_agent_runner）
        │   ◄── events/artifacts ──  （Codex/Claude CLI 在隔离 worktree 执行）
        ▼
   ReviewReport（analyzer 基于事件+产物+spec 打分 + findings + actionPlan）
        │
        └── optimize ──► 新 DevJob（带 source_review_id）──► 再评审闭环
```

**亮点**：API 服务只管「状态 + 审计 + 任务包」，真实 CLI 执行下沉到桌面端本机，生产部署不会在服务器跑 Codex/Claude——这是一个正确的安全边界决策。

---

## 三、安全分析

### 3.1 做得好的地方（应予肯定）

这些是很多团队到上线都没做对的事，本项目在原型阶段就做了：

1. **JWT 密钥强度 fail-fast**（`config.py:82`）：非 local 环境若 `jwt_secret < 32 字符` 或命中弱密钥集合，服务**拒绝启动**。
2. **密钥分离 + 平滑轮转**（`crypto.py`）：模型 API Key 用独立 `SECRET_ENC_KEY` 加密，`MultiFernet` 兼容旧密文，下次保存自动重新加密。
3. **SSRF 防护**（`net.py`）：用户配置的模型 base_url 在出站前拦截私网/回环/链路本地（含 `169.254.169.254` 元数据地址）。
4. **租户隔离一致**：requirements / dev-jobs / reviews 全部走 `get_owned_*` + 跨用户引用 transitive 校验（如 spec 经由 requirement 验证归属），未发现 IDOR。
5. **密码哈希用 Argon2**（`security.py`），非 MD5/SHA1。
6. **refresh token 轮转 + 重置密码吊销旧会话**（`auth/router.py:197`）。
7. **登录限流**：`(ip, identifier)` 维度滑动窗口，5 次 / 300 秒锁定。
8. **审计日志**：approve/trash/optimize/create 等敏感动作落 `audit_logs`，且 `record_audit` 注释明确「payload 不得放密钥」。
9. **敏感产物过滤**：Runner 复制工作区时 `ignore_patterns` 排除 `.env`/`.env.*`/`*.db`/`.git`。
10. **CORS 显式白名单**，非 `*`。

### 3.2 🔴 P0 高危：Runner 事件写入可伪造任务完成状态

> **状态：已加状态机约束（核心已修，Claude 实施）**
> 修复 commit：约束 Runner 事件状态机防止伪造任务流转
> 已完成（修复建议第 2 条）：`append_dev_job_event` 引入状态机白名单——`status` 字段经 schema 限定为合法枚举（`RunnerJobStatus` Literal），且仅允许 `queued→running/blocked/failed`、`running→completed/completed_with_warnings/failed/blocked`，**终态锁定**；非法流转返回 409。新增「`queued→completed` 被拒」「终态不可重开」两项回归测试，全套 **62 passed**。
> 残余（建议后续单独处理，需协同桌面 Runner 协议改造并实测，故本轮未盲改）：
> - **lease 绑定**（修复建议第 1 条）：events 仅允许 lease 持有者推进，需给桌面 Runner 协议新增 `runnerId` 并在真实执行环境验证，否则会误伤真实 Runner；
> - **run-log 前置**（修复建议第 3 条）：`completed` 写入要求存在 `exitCode==0` 的 run-log；
> - 抽取统一 `JobStateMachine` 单一事实来源（见 §架构建议）。
> 说明：本产品为单用户自有 job 模型，用户本就掌控自己机器上的 Runner——上述措施提高伪造门槛与状态一致性，但无法完全杜绝用户对「自己」任务的自我伪造；跨用户伪造已被 ownership 校验（R1）阻断。

**位置**：`backend/app/modules/runner/router.py:331`（`append_dev_job_event`）、`:360`（`append_dev_job_artifact`）

**问题**：这两个端点只校验 `job.user_id == current_user.id`，然后**无条件接受 body 里的 `status`、`progress`、任意 `kind` 的 artifact 并直接落库覆盖 job 状态**：

```python
event = DevJobEvent(job_id=job.id, level=body.level, ...)
if body.status:
    job.status = body.status   # ← 任意 status 直接写
```

**影响**：
- 桌面 Runner 协议的设计意图是「只有持有 lease 的 Runner 才能推进状态」，但实现上**没有校验 `lease_owner` / `lease_expires_at`**。任何登录用户对其自己的 job，都可以直接 `POST /dev-jobs/{id}/events` 把一个 `blocked` 或 `failed` 的任务标记为 `completed`，并塞入伪造的 `run-log`/`diff-summary` artifact。
- 评审分析器 `analyze_review` 完全信任这些 events/artifacts 来打分、推荐引擎、生成交付建议。**伪造产物 → 伪造高分评审 → 伪造「可交付」结论**。对一个「自动评审驱动交付」的产品而言，这是信任链的根，必须收紧。

**修复建议**：
- events/artifacts 写入端点增加 lease 校验：`job.lease_owner` 必须非空且未过期，且 `body.runnerId`（新增字段）须与 lease owner 匹配；否则 409。
- `status` 字段引入状态机白名单，仅允许从当前合法前驱态转移（如 `running → completed|completed_with_warnings|failed`），禁止从 `blocked/failed` 直接跳 `completed`。
- 关键终态（`completed`）写入时，至少要求存在一条 `kind=run-log` 且 `exitCode==0` 的 artifact 作为前置条件。

### 3.3 🟠 P1 中危问题

#### P1-1 `python-jose` 已知 CVE，建议迁移
> **状态：已修复（Claude 实施）** — 已将 `python-jose[cryptography]` 迁移为 `pyjwt`（活跃维护）。`security.py` 用 `jwt.encode`、`auth/router.py` 用 `jwt.decode` + `jwt.PyJWTError`，仍固定 `algorithms=["HS256"]`。已从 venv 卸载 `python-jose` 后全量 **62 passed**，确认无残留 import。
**位置**：`pyproject.toml`、全后端 JWT
`python-jose` 自 2023 年起有多个 CVE（如 CVE-2024-33663 algorithm confusion 等），且项目维护已停滞。当前虽固定 `algorithms=["HS256"]`、签名/验签对称，暂无直接利用路径，但属于**供应链风险**。建议迁移到 `pyjwt`（活跃维护）或 `authlib`。

#### P1-2 依赖版本完全未锁（仅下限）
> **状态：已锁定（前后端，Claude 实施）** — 后端执行 `uv lock` 生成并提交 `backend/uv.lock`（解析 67 个包，含全部传递依赖精确版本与哈希），`uv lock --check` 通过，生产可用 `uv sync --frozen`。前端 `package.json` 的 dependencies/devDependencies 已由 `^` 范围收紧为**精确版本**（锁定到当前测试通过的版本，`package-lock.json` 随之更新为精确 spec），`npm install` 报告 up to date、`npm run build` 通过。
**位置**：`pyproject.toml`、`package.json`
所有依赖均为 `>=` 下限、无上限、无 lockfile 提交（`backend/` 无 `uv.lock`/`poetry.lock`，根目录虽有 `package-lock.json` 但前端依赖同样宽松）。`fastapi>=0.124`、`cryptography>=49` 等任一大版本升级都可能引入破坏性变更或安全回归。
**建议**：后端生成并提交 lockfile（`uv lock`），生产用 `--frozen`；前端锁定到精确版本。

#### P1-3 `.env.example` 含生产级 MySQL 连接串模板
> **状态：已修复（Claude 实施）** — `AGENTPRO_DATABASE_URL` 改为全占位 `mysql+asyncmy://<user>:<password>@<host>:3306/<database>`，并将 `AGENTPRO_SMTP_HOST` 由真实 `smtp.qcloudmail.com` 改为 `smtp.example.com`，不再泄露真实用户名/库名/邮件服务商。
**位置**：`.env.example`
```
AGENTPRO_DATABASE_URL=mysql+asyncmy://agentpro_user:CHANGE_ME@mysql-host:3306/agentpro
```
虽是占位密码，但暴露了真实用户名 `agentpro_user`、库名 `agentpro`、MySQL 方案。属于信息泄露。建议改为 `<user>:<password>@<host>` 全占位。

#### P1-4 Runner 工作区路径可控，潜在目录操纵
**位置**：`runner/executor.py:49`（`workspace_root`）、Tauri `lib.rs:136`（`prepare_local_workspace`）
`workspace_root` 与 `repo_path` 来自设置或前端 env（`VITE_AGENTPRO_LOCAL_*`）。Rust 端 `safe_path` 仅拦截 `..`，但 `workspace_root` 本身可指向任意绝对路径，且 `prepare_local_workspace` 会对目标 `workdir` 执行 `remove_dir_all`。在桌面单用户场景风险有限，但若未来支持远程/多租户，存在「指定系统目录被清空」的破坏面。建议白名单根目录（限定在 `~/.agentpro` 或 temp 下）。

### 3.4 🟡 P2 低危与改进项

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| P2-1 | **passlib[bcrypt] 死依赖** ✅已删除 | `pyproject.toml` | 实际用 `argon2-cffi`（`security.py` 直接用 `PasswordHasher`），`passlib` 从未被 import。已从 pyproject 移除并卸载，全量测试通过。 |
| P2-2 | **限流仅在内存** | `ratelimit.py` | 注释自承认单实例适用。一旦后端水平扩展，登录爆破限流失效。需 Redis 后端共享窗口（`redis` 已在依赖）。 |
| P2-3 | **SQLite 默认 + 写并发** | `config.py:36` | 默认 `sqlite+aiosqlite`，Runner 异步执行（`BackgroundTasks`）+ SSE 流式 + 多请求并发写，SQLite 写锁易触发 `database is locked`。桌面单用户尚可，需文档明确。 |
| P2-4 | **Tauri 无 CSP / capability 配置** | `tauri.conf.json`、capabilities 为 `{}` | 未配置 `app.security.csp`，窗口无内容安全策略；capabilities 目录存在但文件为空 `{}`。`execute_agent_runner` 能 spawn 任意已安装 CLI，应在 capability 中显式收敛。 |
| P2-5 | **前端默认 baseUrl 硬编码第三方** | `models/router.py:27`、`SetupPage.tsx` | 默认 provider 指向 `https://api.sub2api.com/v1`（第三方中转）。用户 API Key 经其后转发，存在信任边界问题。应默认留空让用户自填，或明确标注「第三方中转，密钥将经过该服务」。 |
| P2-6 | **缺测试覆盖度量** | `backend/tests` | 有测试目录但未度量覆盖率；安全关键路径（SSRF、密钥轮转、状态机）应有专门回归测试。 |

### 3.5 未发现的问题（已验证安全）

- ❌ SQL 注入：全部使用 ORM `select`/参数化，未拼 SQL 字符串。
- ❌ 命令注入：Runner 命令均为 `subprocess`/`Command` 的列表参数形式（`["git", "worktree", ...]`），未走 shell；引擎 program 经 `shutil.which` 解析为绝对路径，不接受用户输入作为可执行文件名。
- ❌ 明文密钥入库：模型 API Key 一律 `encrypt_secret` 后存 `api_key_ciphertext`，响应只回 `secretSaved: bool`，不回明文。
- ❌ `.env` 实际泄露：`git ls-files` 仅 `.env.example`，真实 `.env`/`*.db` 均被 ignore 且未跟踪。
- ❌ Prompt Injection 致密钥泄露：Runner prompt 在 system 段硬性要求「不读取/输出 .env、API Key」，且工作区已剥离 `.env`。
- ❌ IDOR：见 3.1.4。
- ❌ XSS（前端）：未发现 `dangerouslySetInnerHTML`（待全量确认，抽样页面安全）。

---

## 四、架构与代码质量

### 4.1 架构优点

1. **职责分离干净**：core（横切）/ modules（业务）/ db（持久化）三层，每个 module 内 `router/schemas/service` 一致。
2. **「API 管状态、桌面管执行」的混合架构**对安全与可运维性是正解，避免服务器跑未审计的 Agent CLI。
3. **统一响应包装** `{ok,data,message}` + 前端 `apiClient` 自动 refresh + 并发去重（`refreshPromise`），工程细节成熟。
4. **评审分析器是规则可解释的**（`analyzer.py`：exit code / diff / test / security hit 加权），不是黑盒 LLM 打分，可信度高。

### 4.2 架构隐患

1. **Runner 状态分布在三处**（DB job.status、DevJobEvent.payload.status、lease），缺乏单一事实来源，正是 P0 的成因。建议抽取 `JobStateMachine`。
2. **`mark_stale_desktop_job_if_needed` 在 GET 请求里写库**（`runner/router.py:81`）：读接口有副作用，会导致缓存/幂等问题，且把 `running → blocked` 的转移逻辑藏在读路径。应改为后台扫描任务。
3. **stream 端点用同一 db session 跨生成器生命周期**（`requirements/router.py:407`）：`StreamingResponse` 的生成器在响应结束后才 commit，若客户端中途断开，session 可能未正确关闭。建议生成器内 `try/finally` 显式关闭。
4. **前端 mock 与真实 API 的边界**靠 `import.meta.env.DEV` 把关，逻辑正确，但 `VITE_AGENTPRO_MOCK_API` 仍可能误导；已有 warn 提示，可接受。
5. **Rust 端 `trim_output` 按字节切 `&value[..LIMIT]`**（`lib.rs:212`）：非字符边界，可能 panic 或产出乱码（中文 UTF-8 多字节）。应改用 `char_indices` 安全截断。**这是一个会触发崩溃的 bug**，建议提级到 P1。

### 4.3 双 Agent 协作的痕迹

代码风格高度一致（命名、注释密度、错误处理范式），看不出明显的「双手冲突」。可见的协作产物：
- 提交历史显示「修复 Runner 阻塞与离线兜底」「修复心跳显示」等迭代式修补 → 说明 Runner 状态机是反复出 bug 的区域（与 P0 一致，根因是状态机缺失，而非补丁不全）。
- `.claude/` 目录存在，说明 Claude Code 在本仓库实际参与开发。

---

## 五、优先级行动清单

### 合并前必须（P0/P1-block）
1. **修复 Runner 事件状态机**（P0）：events/artifacts 写入加 lease + 状态机校验，`completed` 需证据前置。
2. **修复 Rust `trim_output` 字节切片 panic**（P1）：桌面端执行长输出时可能直接崩进程。

### 本周内（P1）
3. 迁移 `python-jose → pyjwt`。
4. 生成并提交后端 lockfile；前端锁定精确版本。
5. `.env.example` 全占位化。
6. 删除 `passlib[bcrypt]` 死依赖。

### 迭代规划（P2）
7. 限流改 Redis 后端。
8. Tauri 配置 CSP + 收敛 capability。
9. `mark_stale` 从读路径移到后台任务。
10. stream 端点 session 生命周期加固。
11. 安全关键路径补单测 + coverage 度量。

---

## 六、给「裁掉谁」的客观回答

> 你说 claude 和 codex 在恶性竞争，要裁掉不优秀的那个。

基于代码本身（而非作者立场）的客观判断：

- **后端 Python 代码质量非常高**：密钥分离、SSRF 防护、租户隔离、fail-fast 校验、审计日志、状态转移注释——这是有安全意识的工程，不像原型。如果这是 codex 写的，**不该裁**。
- **Rust 桌面端有一个真实的 panic bug**（`trim_output` 字节切片），且 Runner 状态机这个 P0 是跨 Python+Rust+协议三层的系统性设计缺陷，不是单点笔误——**这说明「双手交接处」是质量洼地**，问题不在某一个 Agent，而在**没有统一的状态机契约**。
- 前端 TS 代码规范、`apiClient` 的 refresh 去重、auth store 的 partialize 都很专业。

**结论：代码整体优秀，没有「该被裁掉的废件」。** 如果一定要归因，真正的风险点是「双 Agent 在 Runner 状态机这个交叉模块各自补丁、缺少共同契约」——裁掉任何一个 Agent 都不会解决这个问题，**应该做的是补一份 `JobStateMachine` 的契约文档 + 状态转移测试，让两个 Agent（以及未来的人类）都对齐到同一份事实来源。** 用裁人来解决系统性契约缺失，是误伤。
