# AgentPro 后端 Docker 部署

## 部署目标
- 后端 API：FastAPI 容器，默认监听 `8000`
- Redis：Docker Compose 内部服务，用于验证码 TTL、短期租约和后续实时事件 fanout
- MySQL：使用外部云数据库，通过服务器 `.env` 注入连接串
- 部署目录：`/opt/agentpro`

## 当前测试部署
- 服务器：`82.158.226.253`
- 后端目录：`/opt/agentpro/backend`
- 容器：`api`、`redis`
- 健康检查：`http://82.158.226.253:8000/api/v1/health`
- 注意：服务器本机访问公网 IP 与 `127.0.0.1` 均已验证返回 `ok: true`；如本地电脑直连出现 `Empty reply from server`，优先检查云厂商安全组、防火墙、运营商入站策略或端口开放规则。

## Nginx HTTPS 入口
服务器公网 `8000` 在部分本地网络下会出现连接建立但 HTTP 无响应的问题。桌面端生产包统一使用 Nginx HTTPS 前缀入口：

```text
https://api.zgonline.top/agentpro/api/v1
```

对应 Nginx location：

```nginx
location /agentpro/api/v1/ {
    proxy_pass http://127.0.0.1:8000/api/v1/;
    proxy_connect_timeout 60s;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
}
```

本地桌面端打包环境：

```bash
VITE_AGENTPRO_SERVER_URL=https://api.zgonline.top/agentpro/api/v1
VITE_AGENTPRO_MOCK_API=false
```

Tauri 打包后 WebView 还需要在 `src-tauri/tauri.conf.json` 的 CSP 中允许 `connect-src https://api.zgonline.top`。

## 服务器目录
```bash
mkdir -p /opt/agentpro
cd /opt/agentpro
git clone git@github.com:AliceDel66/AgentPro.git .
git checkout feature/agentpro-backend
```

## 环境变量
在服务器上创建 `backend/.env`，可以从 `backend/.env.example` 复制：

```bash
cp backend/.env.example backend/.env
```

必须在服务器 `.env` 中手工填写：
- `AGENTPRO_DATABASE_URL`
- `AGENTPRO_JWT_SECRET`
- `AGENTPRO_SMTP_HOST`
- `AGENTPRO_SMTP_PORT`
- `AGENTPRO_SMTP_USER`
- `AGENTPRO_SMTP_PASSWORD`
- `AGENTPRO_SMTP_FROM`

注意：
- 不要把 `.env` 提交到 Git。
- 不要把数据库密码、SMTP 密码、API Key 或服务器密码写入文档。
- 未配置域名和 HTTPS 前，只作为测试环境开放。
- 本地开发默认 CORS 已包含 `http://127.0.0.1:5173`、`http://localhost:5173`、`http://127.0.0.1:5174`、`http://localhost:5174` 和 `tauri://localhost`。
- 生产部署必须将 `AGENTPRO_CORS_ORIGINS` 收敛为正式前端域名，不应保留宽泛本地调试域名。

## 本地前后端联调
后端默认监听 `127.0.0.1:8000`：

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

前端 Vite 开发服务器默认通过 `/api` 代理到 `http://127.0.0.1:8000`：

```bash
npm run dev
```

注意：
- 前端默认请求真实 `/api/v1` 接口。
- 如需临时使用前端 mock，可显式设置 `VITE_AGENTPRO_MOCK_API=true`。
- Vite 若因端口占用从 `5173` 自动切换到 `5174`，后端本地 CORS 已允许该端口。
- 模型配置页的“获取模型”按钮会用当前输入的 Base URL 与 API Key 调用后端 `/api/v1/model/test`，后端再请求 `${baseUrl}/models` 获取最新模型列表。
- Base URL、API Key 或服务商变更后，前端会清空旧模型列表和默认模型，避免保存过期模型。
- 需求访谈、继续对话和反问确认会读取已保存模型配置，优先调用 `${baseUrl}/chat/completions` 生成智能回复、追问、AgentSpec 草案和安全评审。
- 如果模型返回普通文本而不是 JSON，后端会保留这段文本作为真实助手回复，并用场景化 RequirementGraph 补齐追问和结构状态。
- 如果模型配置缺失、模型服务不可用或返回空内容，后端会降级到本地场景化 RequirementGraph，接口仍保持可用。

## 启动
```bash
cd /opt/agentpro/backend
docker compose up -d --build
docker compose exec api alembic -c alembic.ini upgrade head
```

从 macOS 打包上传后端时必须排除 AppleDouble 和本地缓存文件，避免 Alembic 误加载 `._*.py`：

```bash
COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude '.env' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '.ruff_cache' \
  --exclude '*.egg-info' \
  --exclude 'agentpro_local.db' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  -czf /tmp/agentpro-backend.tar.gz backend
```

## 自动部署（push 即更新）
推送到 `feature/agentpro-backend` 且改动 `backend/**` 时，GitHub Actions 自动 SSH 到服务器
更新后端容器。链路：`.github/workflows/deploy-backend.yml` → 服务器 `git reset --hard` →
`backend/scripts/deploy-remote.sh`（构建 → `alembic upgrade head` → `up -d` → 健康检查 → **失败自动回滚**）。

关键不变量：
- 部署脚本只构建/迁移/重启，**绝不执行 `git clean`**，以保留未跟踪的 `backend/.env`（生产配置不在 Git 中）。
- 迁移在「构建后、启动前」执行，失败即中止、旧容器继续服务。
- 部署前把「当前在跑镜像」打成 `agentpro-api:rollback` 固定为回滚点（也使其脱离 dangling，`image prune` 不会清掉）。
- **新容器健康检查失败 → 自动把镜像名指回旧镜像并重建，prod 恢复上一版本**；脚本以非零退出让 Action 判失败。
- 自动回滚只回退「镜像（代码）」，不回退「数据库 schema」。本项目迁移均为增量、旧代码可在新 schema 上运行；
  若某次部署含破坏性迁移（删列/改名），回滚后需人工 `alembic downgrade`。

### 一次性配置（仓库 Secrets）
仓库 → Settings → Secrets and variables → Actions 新增：

| Secret | 值 | 说明 |
| --- | --- | --- |
| `DEPLOY_SSH_HOST` | `82.158.226.253` | 服务器地址 |
| `DEPLOY_SSH_USER` | 如 `root` | 登录用户 |
| `DEPLOY_SSH_KEY` | SSH 私钥（PEM 整段） | 对应公钥需在服务器 `~/.ssh/authorized_keys` |
| `DEPLOY_SSH_PORT` | `22` | 可选，默认 22 |
| `DEPLOY_REPO_DIR` | `/opt/agentpro` | 服务器仓库根目录 |

### 一次性服务器前置
1. `/opt/agentpro` 是 Git 克隆且 `origin` 指向 `git@github.com:AliceDel66/AgentPro.git`，
   并已配置好对 GitHub 的拉取权限（私有仓库需部署密钥/凭据），`git fetch` 可用。
2. 已装 `git` / `docker` / `docker compose` / `curl`，且部署用户在 docker 组内。
3. `backend/.env` 已存在（生产配置）——脚本检测不到会直接中止。

### 手动触发 / 手动部署 / 回滚
- 手动触发：仓库 Actions 页选择「Deploy backend」→ Run workflow。
- 服务器手动部署：`cd /opt/agentpro && git pull && bash backend/scripts/deploy-remote.sh`。
- 服务器手动回滚：`cd /opt/agentpro/backend && bash scripts/deploy-remote.sh rollback`
  （把 `agentpro-api:rollback` 重新挂回并重建；用于部署成功一段时间后才暴露的问题）。

## 验收
```bash
curl http://<SERVER_IP>:8000/api/v1/health
```

期望返回：

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "service": "agentpro-api",
    "version": "0.1.0",
    "contractVersion": 2,
    "minDesktopContractVersion": 2,
    "capabilities": [
      "runner.desktop-local.v1",
      "runner.artifact.delivery-manifest.v1",
      "review.delivery-manifest-payload.v1",
      "review.action-plan.v1"
    ]
  },
  "message": null
}
```

## 常用运维命令
```bash
cd /opt/agentpro/backend
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose pull
docker compose up -d --build
```

## 上线前必须补齐
- 域名和 HTTPS 证书
- 生产 CORS 白名单
- 数据库最小权限账号
- 日志轮转和告警
- 备份和恢复演练
- 更严格的 API 限流和审计查询后台
