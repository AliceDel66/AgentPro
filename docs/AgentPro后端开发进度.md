# AgentPro 后端开发进度

## 项目信息
- 项目名称：AgentPro Backend
- 技术栈：FastAPI + Python 3.12 + LangGraph + SQLAlchemy/Alembic + MySQL 8 + Redis + Docker Compose
- 开发分支：feature/agentpro-backend

## 开发约定
- 每完成一个后端板块必须提交 Git commit
- Commit message 使用中文
- 每个板块完成后更新本文档
- 每个板块必须同步前端服务层并运行必要检查
- 不提交 `.env`、数据库密码、SMTP 密码、API Key、服务器密码、真实用户隐私数据

## 进度记录

### 1. 后端项目骨架
- 状态：已完成
- 完成功能：
  - 初始化 FastAPI 后端目录结构
  - 新增统一 ApiResult 响应结构
  - 新增 `/api/v1/health` 健康检查接口
  - 新增 Dockerfile 与 docker-compose 基础配置
  - 新增 `.env.example`，仅包含占位配置
  - 前端新增健康检查服务占位
- 相关文件：
  - backend/pyproject.toml
  - backend/app/main.py
  - backend/app/api/router.py
  - backend/app/core/config.py
  - backend/app/core/responses.py
  - backend/app/modules/health/router.py
  - backend/tests/test_health.py
  - backend/Dockerfile
  - backend/docker-compose.yml
  - backend/.env.example
  - src/services/healthService.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：a8c9b0e
  - 信息：初始化 Python 后端项目骨架与健康检查接口

### 2. 数据库与迁移
- 状态：已完成
- 完成功能：
  - 新增 SQLAlchemy 2.x 异步数据库会话层
  - 新增 Alembic 配置和初始迁移
  - 建立 users、email_verification_codes、refresh_tokens、model_provider_configs、requirements、conversation_messages、requirement_decisions、agent_specs、agent_graph_runs、dev_jobs、dev_job_events、dev_job_artifacts、review_reports、review_findings、audit_logs 核心表
  - `.env.example` 保持占位配置，不写入真实阿里云数据库凭据
  - 新增数据库元数据和建表测试
- 相关文件：
  - backend/app/db/base.py
  - backend/app/db/session.py
  - backend/app/db/models.py
  - backend/alembic.ini
  - backend/alembic/env.py
  - backend/alembic/versions/20260617_0001_initial_schema.py
  - backend/tests/test_database.py
  - backend/.env.example
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：7202695
  - 信息：完成 MySQL 数据库模型与迁移基础设施

### 3. 登录注册与腾讯云 SMTP
- 状态：已完成
- 完成功能：
  - 实现邮箱验证码发送接口，本地/测试环境不依赖真实 SMTP
  - 验证码仅存哈希，支持过期时间和发送冷却限制
  - 实现邮箱验证码注册、账号/邮箱密码登录、JWT access token、refresh token、刷新、注销和 `/me`
  - 密码使用 Argon2 哈希，refresh token 仅存哈希
  - 腾讯云 SMTP 配置全部通过环境变量注入
  - 前端 authService 改为会话结构，apiClient 支持统一响应解包和 `/api/v1` 前缀
- 相关文件：
  - backend/app/modules/auth/router.py
  - backend/app/modules/auth/schemas.py
  - backend/app/modules/email/service.py
  - backend/app/core/security.py
  - backend/tests/test_auth.py
  - backend/tests/conftest.py
  - src/services/apiClient.ts
  - src/services/authService.ts
  - src/services/types.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：3634282
  - 信息：完成邮箱验证码注册登录与 JWT 会话

### 4. 模型配置
- 状态：已完成
- 完成功能：
  - 实现模型配置读取、保存、连接测试和模型列表接口
  - 支持 sub2api、OpenAI-compatible、custom 三类配置
  - API Key 使用后端 Fernet 加密存储，前端只返回 secretSaved 状态
  - 前端 modelService 改为 PUT `/model/config`，新增 testModelConfig
  - 前端 apiClient 支持自动携带本地 access token
- 相关文件：
  - backend/app/modules/models/router.py
  - backend/app/modules/models/schemas.py
  - backend/app/core/crypto.py
  - backend/tests/test_model_config.py
  - src/services/modelService.ts
  - src/services/apiClient.ts
  - src/services/authService.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：1801202
  - 信息：完成模型配置与模型列表接口对接

### 5. LangGraph 需求访谈
- 状态：已完成
- 完成功能：
  - 新增 RequirementGraph，包含 intake_summary、gap_analysis、followup_questions、decision_merge、spec_draft、safety_review、approval_wait 节点
  - 实现需求创建、多轮消息追加、主动反问生成、反问确认归纳
  - 每次 graph run 写入 agent_graph_runs.state_snapshot，需求成熟度和状态同步更新
  - 前端需求服务层接入 `/requirements`、`/messages`、`/followups/confirm`
- 相关文件：
  - backend/app/modules/requirements/graph.py
  - backend/app/modules/requirements/router.py
  - backend/app/modules/requirements/schemas.py
  - backend/tests/test_requirements.py
  - src/services/agentSpecService.ts
  - src/services/types.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：51b2ad2
  - 信息：完成 LangGraph 需求访谈与反问确认流程

### 6. AgentSpec 与需求库
- 状态：已完成
- 完成功能：
  - 实现 AgentSpec 生成、读取、审批和需求归档接口
  - AgentSpec 草案来自 RequirementGraph 最新快照，并包含安全评审和审批检查清单
  - 需求库列表支持按当前用户读取并返回前端现有 AgentRequirement 结构
  - 前端服务层新增 generateAgentSpec、getAgentSpec、approveAgentSpec、archiveRequirement
- 相关文件：
  - backend/app/modules/requirements/router.py
  - backend/app/modules/requirements/schemas.py
  - backend/tests/test_requirements.py
  - src/services/agentSpecService.ts
  - src/services/types.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：22cf624
  - 信息：完成 AgentSpec 草案审批与需求库接口

### 7. 本地 Runner 协议与 Tauri 命令桥
- 状态：已完成
- 完成功能：
  - 实现 dev job 创建、读取、租约领取、事件回传、产物回传和事件列表接口
  - strategy 支持 codex、claude-code、parallel，并返回对应 engines
  - 前端 runnerService 接入 `/dev-jobs` 协议
  - Tauri 新增白名单 CLI 检测、命令构建和启动命令，不接受任意 shell 字符串
  - Tauri 命令仅允许 codex 和 claude-code 两类引擎
- 相关文件：
  - backend/app/modules/runner/router.py
  - backend/app/modules/runner/schemas.py
  - backend/tests/test_runner.py
  - src/services/runnerService.ts
  - src-tauri/src/lib.rs
  - src-tauri/Cargo.toml
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已通过 cd src-tauri && cargo check
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：b2696e1
  - 信息：完成本地 Runner 协议与 Tauri 命令桥对接

### 8. 并行开发监控
- 状态：已完成
- 完成功能：
  - 新增 `/dev-jobs/{id}/stream` SSE 状态流
  - SSE 输出 snapshot、log、heartbeat 事件，可用于前端监控页实时日志
  - 复用 dev job events 作为持久化日志来源
  - 前端 runnerService 新增 stream path 辅助函数
- 相关文件：
  - backend/app/modules/runner/router.py
  - backend/tests/test_runner.py
  - src/services/runnerService.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：b98497a
  - 信息：完成并行开发监控与实时日志接口

### 9. 自动评审
- 状态：已完成
- 完成功能：
  - 实现自动评审创建、读取、接受和返工接口
  - 评审基于 dev job 事件、runner artifact 和 AgentSpec 生成确定性初评分
  - 覆盖功能完成度、稳定性、性能、幻觉风险和安全风险 finding
  - 前端 reviewService 接入 createReviewReport、accept、rework
- 相关文件：
  - backend/app/modules/review/router.py
  - backend/app/modules/review/schemas.py
  - backend/tests/test_review.py
  - src/services/reviewService.ts
  - src/services/types.ts
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：2976e49
  - 信息：完成自动评审报告生成与前端对接

### 10. Docker 部署
- 状态：已完成
- 完成功能：
  - 调整 Dockerfile 为生产运行镜像，复制 app、alembic 和迁移配置
  - docker-compose 配置 api、redis、日志卷和 Redis 内部连接
  - 新增后端部署文档，说明 `/opt/agentpro`、`.env`、迁移和健康检查流程
  - 文档仅使用占位符，不记录真实数据库、SMTP、服务器密码或 API Key
- 相关文件：
  - backend/Dockerfile
  - backend/docker-compose.yml
  - docs/AgentPro后端部署.md
- 验证结果：
  - 已通过 backend/.venv/bin/python -m pytest backend/tests
  - 已通过 backend/.venv/bin/python -m ruff check backend/app backend/tests
  - 已通过 npm run typecheck
  - 已通过 npm run build
  - 未运行 Docker 镜像构建：本机未安装 docker 命令
  - 已完成敏感信息扫描，未发现数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据
- Commit：
  - 哈希：
  - 信息：完成 Docker 部署配置与服务器上线文档
