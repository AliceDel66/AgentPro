# AgentPro Desktop

AgentPro 是一个面向技术小白的桌面端 Agent 开发助手。它通过对话式需求访谈帮助用户补齐业务场景、权限边界、交付方式和验收标准，生成 AgentSpec 后再调用用户本机的 Codex / Claude Code CLI 进行真实开发，并基于 Runner 事件、产物、diff、测试结果和 AgentSpec 生成自动评审报告。

当前仓库包含：

- `src/`：Tauri 桌面端前端，React + TypeScript + HeroUI + Tailwind CSS。
- `src-tauri/`：Tauri 2 本机能力，包括本机 CLI 检测、Runner 执行、目录打开等命令。
- `backend/`：Python FastAPI 后端，负责认证、模型配置、需求访谈、AgentSpec、开发任务、评审报告、审计和持久化。
- `docs/`：开发进度、审查报告、部署说明和工作流设计文档。

## 核心能力

- 邮箱验证码注册、账号/邮箱 + 密码登录、JWT access/refresh 会话。
- OpenAI-compatible 模型配置，支持 `baseUrl + apiKey`，当前按 sub2api 等中转服务设计。
- 多轮需求访谈、主动反问、反问确认、AgentSpec 草案生成与审批。
- 严格 workflow：需求访谈 -> 需求草案 -> 开发调度 -> 并行监控 -> 自动评审。
- 需求库作为工作流中心，展示开发状态、开发方式、评审分和下一步操作。
- 桌面端调用用户本机 Codex / Claude Code CLI，后端只保存任务状态、日志和产物证据。
- Runner 默认把开发工作区保存到 `~/AgentPro/runs`，也可在设置页自定义 Agent 开发保存目录。
- 每次真实开发完成后生成 `agentpro-delivery.json` 交付清单，评审页可打开工作区、构建产物、README 并复制预览命令。
- 自动评审报告包含总览、详细报告、证据链、优化方案和交付建议。
- 报告档案支持查看历史报告、补全旧报告、重新生成报告和基于报告发起优化。

## 技术栈

### 桌面端

- Tauri 2
- React 18
- TypeScript
- HeroUI
- Tailwind CSS
- Zustand
- Vite
- lucide-react

### 后端

- Python 3.12+
- FastAPI
- SQLAlchemy 2 async
- Alembic
- MySQL 8
- Redis
- LangGraph + LangChain Core
- Tencent Cloud SES SMTP
- Docker Compose

## 环境要求

- Node.js 20+
- npm
- Rust stable toolchain
- Python 3.12+
- MySQL 8 数据库
- Redis
- 可选：本机已安装并登录可用的 `codex` CLI、`claude` / Claude Code CLI

## 本地启动

### 1. 安装前端依赖

```bash
npm install
```

### 2. 配置后端环境变量

```bash
cd backend
cp .env.example .env
```

在 `backend/.env` 中填写本地或测试环境配置。不要提交 `.env`。

关键变量：

```text
AGENTPRO_DATABASE_URL=mysql+asyncmy://USER:PASSWORD@HOST:3306/DATABASE
AGENTPRO_REDIS_URL=redis://127.0.0.1:6379/0
AGENTPRO_JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
AGENTPRO_SECRET_ENC_KEY=CHANGE_ME_TO_ANOTHER_LONG_RANDOM_SECRET
AGENTPRO_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,tauri://localhost
AGENTPRO_SMTP_HOST=smtp.qcloudmail.com
AGENTPRO_SMTP_PORT=465
AGENTPRO_SMTP_USER=CHANGE_ME
AGENTPRO_SMTP_PASSWORD=CHANGE_ME
AGENTPRO_SMTP_FROM=AgentPro <noreply@example.com>
```

### 3. 启动后端

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/v1/health
```

### 4. 启动桌面端

```bash
npm run tauri dev
```

Tauri 开发窗口默认加载：

```text
http://127.0.0.1:5173/
```

如只需要浏览器调试前端：

```bash
npm run dev
```

## 前端环境变量

前端默认通过 `/api/v1` 请求后端，Vite 本地代理到 `http://127.0.0.1:8000`。

常用变量：

```text
VITE_AGENTPRO_SERVER_URL=http://127.0.0.1:8000
VITE_AGENTPRO_LOCAL_REPO_PATH=/path/to/base/repo
VITE_AGENTPRO_LOCAL_WORKSPACE_ROOT=/path/to/agentpro-workspaces
```

说明：

- `VITE_AGENTPRO_SERVER_URL` 用于指定后端地址。为空时使用 `/api/v1`。
- `VITE_AGENTPRO_LOCAL_REPO_PATH` 是本机 Runner 的基础项目路径，可用于让 Codex / Claude Code 在指定项目上开发。
- `VITE_AGENTPRO_LOCAL_WORKSPACE_ROOT` 是 Agent 开发产物保存根目录。桌面端设置页中的用户选择优先级更高；均未配置时默认使用 `~/AgentPro/runs`。

临时启用前端 mock，仅开发环境有效：

```bash
VITE_AGENTPRO_MOCK_API=true npm run dev
```

生产构建会忽略 mock 标记，始终请求真实后端。

## 本机 Runner 工作方式

AgentPro 不在云端服务器直接运行 Codex / Claude Code。真实开发由桌面端负责：

1. 用户审批 AgentSpec。
2. 桌面端创建 `DevJob`。
3. 桌面端向后端领取 Runner package。
4. Tauri 命令桥检测本机 `codex` / `claude` CLI。
5. 在隔离工作区执行开发任务。
6. 将 stdout、stderr、diff、run-log、test-report 等证据回传后端。
7. 在工作区生成 `agentpro-delivery.json`，记录工作区、构建产物、README、修改文件、未跟踪文件和预览命令。
8. 后端基于证据和交付清单生成评审报告。

如果 CLI 不可用或执行器无心跳，任务会被标记为 `blocked` 或 `failed`，监控页会显示错误事件。

默认工作区结构：

```text
~/AgentPro/runs/<jobId>/<engine>/
├── agentpro-runner-prompt.md
├── agentpro-delivery.json
├── dist/
├── README.md
└── ...
```

评审详情页的“本机交付结果”会优先读取 `delivery-manifest` artifact：

- 打开 Runner 工作区
- 打开构建产物（如存在 `dist/index.html`）
- 打开 README
- 复制本地预览命令
- 查看 diff 证据

## 常用命令

前端类型检查：

```bash
npm run typecheck
```

前端构建：

```bash
npm run build
```

前端 lint 当前复用 TypeScript 检查：

```bash
npm run lint
```

Tauri Rust 检查：

```bash
cd src-tauri
cargo fmt --check
cargo check
```

后端测试：

```bash
backend/.venv/bin/python -m pytest backend/tests
```

后端 ruff：

```bash
backend/.venv/bin/python -m ruff check backend/app backend/tests
```

构建后端 Docker 镜像：

```bash
cd backend
docker compose build
```

启动后端 Docker Compose：

```bash
cd backend
docker compose up -d
```

## 设计稿验收

设计稿文件：

```text
/Users/yaocheng/Downloads/AgentPro.dc.html
```

建议按 `1440x900` 视口逐页对照：

- 登录、注册、找回密码
- 模型配置
- 需求访谈
- 反问确认
- AgentSpec 草案与审批
- 需求库
- 开发调度
- 并行开发监控
- 自动评审报告
- 报告档案
- 设置

桌面端页面应保持 56px 图标侧栏、顶部 workflow 阶段条、HeroUI 风格按钮和整体蓝色系视觉。

## API 概览

主要后端接口：

- `POST /api/v1/auth/email-code`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/model/config`
- `PUT /api/v1/model/config`
- `GET /api/v1/model/list`
- `POST /api/v1/requirements`
- `GET /api/v1/requirements`
- `POST /api/v1/requirements/{id}/messages`
- `POST /api/v1/requirements/{id}/spec/generate`
- `POST /api/v1/requirements/{id}/approve`
- `POST /api/v1/dev-jobs`
- `GET /api/v1/dev-jobs/{id}`
- `GET /api/v1/dev-jobs/{id}/runner-package`
- `POST /api/v1/dev-jobs/{id}/events`
- `POST /api/v1/dev-jobs/{id}/artifacts`
- `POST /api/v1/reviews`
- `GET /api/v1/reviews`
- `GET /api/v1/reviews/{id}`
- `POST /api/v1/reviews/{id}/regenerate`
- `POST /api/v1/reviews/{id}/optimize`

## 安全约定

- 不提交 `.env`、数据库密码、SMTP 密码、API Key、服务器密码或真实用户数据。
- 用户模型 API Key 由后端加密存储，前端只显示 `secretSaved` 或脱敏状态。
- 桌面端 Runner 只能通过白名单 Tauri 命令调用本机 CLI，不允许任意 shell 字符串执行。
- 后端测试必须使用隔离配置，不应读取真实生产配置。
- 上线真实用户前必须配置域名、HTTPS、CORS 白名单、日志审计和备份策略。

## 开发纪律

- 每个功能板块完成后单独提交 Git commit。
- commit message 使用中文。
- 每次提交前检查敏感信息和无关文件。
- 每个板块完成后更新：
  - `docs/AgentPro开发进度.md`
  - `docs/AgentPro后端开发进度.md`（涉及后端时）

## 当前边界

- 当前是本地开发和测试部署版本，不是生产发行版。
- 真实开发依赖用户本机已安装并登录 Codex / Claude Code CLI。
- 邮箱、数据库、模型中转、Runner 产物目录均需要在本地或服务器 `.env` 中配置。
- 没有 HTTPS 前，不建议开放给真实用户使用。
