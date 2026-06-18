# AgentPro 后端 Docker 部署

## 部署目标
- 后端 API：FastAPI 容器，默认监听 `8000`
- Redis：Docker Compose 内部服务，用于验证码 TTL、短期租约和后续实时事件 fanout
- MySQL：使用外部云数据库，通过服务器 `.env` 注入连接串
- 部署目录：`/opt/agentpro`

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

## 验收
```bash
curl http://<SERVER_IP>:8000/api/v1/health
```

期望返回：

```json
{"ok":true,"data":{"status":"ok","service":"agentpro-api","version":"0.1.0"},"message":null}
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
