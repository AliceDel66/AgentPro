#!/usr/bin/env bash
# 在服务器上构建并更新 AgentPro 后端容器。
# 前置：调用方已把代码更新到目标分支（CI 会先 git reset；手动用法见下）。
# 手动用法：cd /opt/agentpro && git pull && bash backend/scripts/deploy-remote.sh
#
# 关键不变量：
#   - 只构建/迁移/重启容器，绝不执行 `git clean`，以保留未跟踪的 backend/.env（生产配置）。
#   - 迁移在「构建后、启动前」执行；迁移失败则中止，旧容器继续提供服务。
set -euo pipefail

# 定位到 backend/ 目录（脚本位于 backend/scripts/ 下），与 cwd 无关。
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

if [ ! -f .env ]; then
  echo "[deploy] 错误：缺少 backend/.env（生产配置），已中止部署。" >&2
  exit 1
fi

echo "[deploy] 1/4 构建镜像 ..."
docker compose build

echo "[deploy] 2/4 数据库迁移 alembic upgrade head ..."
docker compose run --rm api alembic upgrade head

echo "[deploy] 3/4 启动/更新容器 ..."
docker compose up -d
docker image prune -f || true

echo "[deploy] 4/4 健康检查 ..."
for _ in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
    echo "[deploy] 健康检查通过 ✅"
    exit 0
  fi
  sleep 3
done

echo "[deploy] 健康检查失败 ❌（请查看 docker compose logs api）" >&2
exit 1
