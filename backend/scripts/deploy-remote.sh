#!/usr/bin/env bash
# 在服务器上构建并更新 AgentPro 后端容器，带「健康检查失败自动回滚」。
# 前置：调用方已把代码更新到目标分支（CI 会先 git reset；手动用法见下）。
#
# 用法：
#   bash backend/scripts/deploy-remote.sh            # 部署（失败自动回滚到上一镜像）
#   bash backend/scripts/deploy-remote.sh rollback   # 手动回滚到上一镜像
#   手动部署：cd /opt/agentpro && git pull && bash backend/scripts/deploy-remote.sh
#
# 关键不变量：
#   - 只构建/迁移/重启容器，绝不执行 `git clean`，以保留未跟踪的 backend/.env（生产配置）。
#   - 迁移在「构建后、启动前」执行；迁移失败即中止，旧容器继续服务。
#   - compose 把镜像固定命名为 agentpro-api:current；构建前先把它打成 agentpro-api:rollback
#     固定回滚点（也使旧镜像脱离 dangling，`image prune` 不会清掉）。
#   - 新容器健康检查失败 → 把 current 标签指回 rollback 镜像并强制重建，prod 恢复上一版本。
#
# 注意：自动回滚只回退「镜像（代码）」，不回退「数据库 schema」。本项目迁移均为增量、
#   旧代码可在新 schema 上运行；若某次部署含破坏性迁移（删列/改名），回滚后需人工
#   `alembic downgrade`。
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

IMAGE="agentpro-api:current"      # 与 docker-compose.yml 中 api.image 一致
ROLLBACK="agentpro-api:rollback"  # 上一版本的固定回滚 tag
HEALTH_URL="http://127.0.0.1:8000/api/v1/health"

require_env() {
  if [ ! -f .env ]; then
    echo "[deploy] 错误：缺少 backend/.env（生产配置），已中止。" >&2
    exit 1
  fi
}

health_ok() {
  for _ in $(seq 1 10); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# 镜像 tag 对应的镜像 ID（不存在则空），与「在跑容器」无关，结果确定。
image_id() {
  docker image inspect -q "$1" 2>/dev/null || true
}

cmd_rollback() {
  require_env
  if [ -z "$(image_id "$ROLLBACK")" ]; then
    echo "[deploy] 无可回滚镜像（$ROLLBACK 不存在），请人工介入。" >&2
    exit 1
  fi
  echo "[deploy] 回滚：将 $IMAGE 指回 $ROLLBACK 并强制重建 ..."
  docker tag "$ROLLBACK" "$IMAGE"
  docker compose up -d --force-recreate
  if health_ok; then
    echo "[deploy] 回滚后健康检查通过 ✅"
  else
    echo "[deploy] 回滚后仍不健康 ❌（请查看 docker compose logs api）" >&2
    exit 1
  fi
}

cmd_deploy() {
  require_env
  local prev_id
  prev_id="$(image_id "$IMAGE")"  # 当前 current 镜像（旧版），首次部署为空

  # 构建前固定回滚点：把旧 current 打成 rollback（脱离 dangling，prune 不会清）。
  if [ -n "$prev_id" ]; then
    docker tag "$IMAGE" "$ROLLBACK"
  fi

  echo "[deploy] 1/4 构建镜像 $IMAGE ..."
  docker compose build api  # 构建并把镜像重新打成 agentpro-api:current（=新版）

  echo "[deploy] 2/4 数据库迁移 alembic upgrade head ..."
  if ! docker compose run --rm api alembic upgrade head; then
    echo "[deploy] 迁移失败，未替换在跑容器，旧版继续服务 ❌" >&2
    exit 1
  fi

  echo "[deploy] 3/4 启动/更新容器 ..."
  docker compose up -d

  echo "[deploy] 4/4 健康检查 ..."
  if health_ok; then
    docker image prune -f >/dev/null 2>&1 || true  # rollback 已打 tag，不会被清
    echo "[deploy] 部署成功，健康检查通过 ✅（回滚点：$ROLLBACK）"
    exit 0
  fi

  echo "[deploy] 新容器不健康，开始自动回滚 ..." >&2
  if [ -n "$prev_id" ]; then
    docker tag "$ROLLBACK" "$IMAGE"
    docker compose up -d --force-recreate
    if health_ok; then
      echo "[deploy] 已自动回滚到上一版本，prod 恢复服务 ✅（本次部署判定失败）" >&2
      exit 1
    fi
    echo "[deploy] 回滚后仍不健康，请人工介入 ❌" >&2
    exit 1
  fi
  echo "[deploy] 首次部署无可回滚镜像，请人工介入 ❌（docker compose logs api）" >&2
  exit 1
}

case "${1:-deploy}" in
  deploy) cmd_deploy ;;
  rollback) cmd_rollback ;;
  *)
    echo "用法: $0 [deploy|rollback]" >&2
    exit 2
    ;;
esac
