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
