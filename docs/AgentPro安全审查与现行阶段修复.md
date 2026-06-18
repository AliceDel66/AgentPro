# AgentPro 安全审查与现行阶段修复

> 审查日期：2026-06-18
> 审查范围：`backend/`（FastAPI + SQLAlchemy + LangGraph）、`src/`（React + Tauri 前端）、配置与测试
> 分支：`feature/agentpro-backend`

---

## 一、结论速览

| 维度 | 状态 |
| --- | --- |
| 鉴权/越权（IDOR） | 整体良好，需求/任务/评审均校验归属；评审 spec 存在 1 处遗漏（中危） |
| 密钥与凭据管理 | **存在严重隐患**：真实生产凭据明文落盘、密钥默认值、密钥复用 |
| 注入类（SQL/命令/XSS） | 未发现 SQL 注入（全程 ORM 参数化）；XSS 面较小（无 `dangerouslySetInnerHTML`） |
| SSRF | **存在**：模型 `base_url` 用户可控且后端直接请求，无内网黑名单 |
| 传输/CORS/文档暴露 | 默认配置偏宽松（0.0.0.0、docs 默认开启） |
| 测试隔离 | 原先会连真实 SMTP 发真实邮件（本次已修复） |

> 重要：`backend/.env` 中的真实凭据**未进入 git 历史**（已用 `git log --all -S` 核实），但仍以明文存在于开发机，且密码强度弱。**请优先轮换，详见 [第四节](#四必须立即执行的动作)。**

---

## 二、问题清单（按严重程度）

### 🔴 严重（Critical）

#### C1. 真实生产凭据明文存放于 `backend/.env`
- **位置**：`backend/.env`
- **现象**：包含真实的阿里云 RDS MySQL 连接串（含库密码）、`AGENTPRO_JWT_SECRET`、腾讯企业邮 SMTP 账号与密码。数据库密码与邮箱密码均为弱口令、且呈可推测的同源模式。
- **影响**：任何能读取该文件的人（本机其他进程、误打包进镜像、误提交）即可直连生产数据库、伪造任意用户登录态、冒用邮件发信域名。
- **现状判断**：`.gitignore` 已忽略 `backend/.env`，且历史中未检索到这些明文（安全）。但凭据本身已处于「已知」状态，必须视为泄露处理。
- **修复**：见 [第四节](#四必须立即执行的动作)（轮换 + 改用密钥管理）。

### 🟠 高（High）

#### H1. JWT 密钥存在公开默认值，且无启动校验 — ✅ 已修复（见 §三.4）
- **位置**：`backend/app/core/config.py:28` → `jwt_secret: str = "CHANGE_ME_LOCAL_ONLY"`
- **影响**：若生产环境忘记注入 `AGENTPRO_JWT_SECRET`，服务会以公开已知字符串签发/校验 JWT，攻击者可离线伪造任意用户的 access token（`create_access_token` 用 HS256 + 该密钥）。
- **修复**：非 `local` 环境启动时强制校验密钥强度，缺省即拒绝启动。

```python
# config.py —— 建议在 get_settings() 中加入
import secrets

@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    weak = {"CHANGE_ME_LOCAL_ONLY", "CHANGE_ME_TO_A_LONG_RANDOM_SECRET", ""}
    if settings.env not in {"local", "test"}:
        if settings.jwt_secret in weak or len(settings.jwt_secret) < 32:
            raise RuntimeError("AGENTPRO_JWT_SECRET 未配置或强度不足，拒绝在非本地环境启动")
    return settings
```

#### H2. 数据加密密钥与 JWT 签名密钥同源（密钥复用）— ✅ 已修复（见 §三.4）
- **位置**：`backend/app/core/crypto.py:9-12` → `Fernet(urlsafe_b64encode(sha256(jwt_secret)))`
- **影响**：用户模型 API Key 的密文（`model_provider_configs.api_key_ciphertext`）用「JWT 密钥派生」的 Fernet key 加密。一旦 JWT 密钥泄露（见 H1/C1），库中所有用户的第三方 API Key 可被批量解密。违反「签名密钥 ≠ 加密密钥」的密钥分离原则。
- **修复**：引入独立的 `AGENTPRO_SECRET_ENC_KEY`（32 字节 base64），与 JWT 密钥彻底分离；旧数据做一次性迁移重加密。

```python
# config.py 新增字段
secret_enc_key: str = ""   # base64-encoded 32 bytes, AGENTPRO_SECRET_ENC_KEY

# crypto.py
def get_secret_fernet() -> Fernet:
    settings = get_settings()
    raw = settings.secret_enc_key or settings.jwt_secret  # 过渡期回退，迁移完成后移除回退
    key = urlsafe_b64encode(sha256(raw.encode()).digest())
    return Fernet(key)
```

#### H3. SSRF：模型 `base_url` 用户可控且后端直接发起请求 — ✅ 已修复（见 §三.4）
- **位置**：`backend/app/modules/models/router.py:55-67`（`fetch_openai_model_names`）、`backend/app/modules/requirements/ai_service.py:65-86`（`call_openai_chat_completion`）
- **现象**：用户在「模型配置」里填的 `baseUrl` 会被后端拼成 URL 直接 `httpx` 请求。当前仅对 `example/localhost/127.0.0.1` 做了「跳过」处理，但未阻止 `169.254.169.254`（云元数据）、`10.x/172.16.x/192.168.x`（内网）、`[::1]`、内网域名等。
- **影响**：配合 `api_host=0.0.0.0`，若后端部署在云主机，攻击者可借此探测内网服务、读取云厂商元数据（可能含临时凭据）。
- **修复**：请求前解析目标主机并做地址白/黑名单校验（拒绝私有/保留/回环地址，仅允许 https + 公网），并对响应大小与跳转做限制。

```python
import ipaddress, socket
from urllib.parse import urlparse

def assert_safe_outbound_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"}:
        raise ValueError("unsupported scheme")
    host = parsed.hostname or ""
    for info in socket.getaddrinfo(host, None):
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("blocked internal address")
```

### 🟡 中（Medium）

#### M1. 登录接口无频率限制 / 账户锁定 — ✅ 已修复（见 §三.4）
- **位置**：`backend/app/modules/auth/router.py:180-190`（`login`）
- **影响**：可对 `/auth/login` 做在线暴力破解。邮件验证码有 60s 冷却，但登录无任何限速。
- **修复**：基于 Redis（项目已依赖 `redis`）做「IP+账号」滑动窗口限速与失败计数锁定；登录失败统一文案避免用户枚举。

#### M2. 评审创建未校验 spec 归属（轻度 IDOR）— ✅ 已修复（见 §三.4）
- **位置**：`backend/app/modules/review/router.py:74-77`
- **现象**：`job` 校验了 `job.user_id == current_user.id`，但 `spec = session.get(AgentSpec, body.specId)` **未**校验该 spec 是否属于当前用户，后续还读取 `spec.body.safetyReview` 影响评分。
- **影响**：可通过猜测 specId 判断他人 spec 是否存在、间接读取其风险等级。
- **修复**：

```python
spec = await session.get(AgentSpec, body.specId) if body.specId else None
if spec:
    req = await session.get(Requirement, spec.requirement_id)
    if not req or req.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="AgentSpec not found")
```

#### M3. 默认监听 `0.0.0.0` 与默认开启 API 文档 — ✅ 已修复（见 §三.4）
- **位置**：`backend/app/core/config.py:16`（`api_host="0.0.0.0"`）、`:25`（`docs_enabled=True`）
- **影响**：本地/桌面形态下监听所有网卡，局域网内可访问后端；生产环境默认暴露 `/docs`、`/openapi.json` 泄露完整接口结构。
- **修复**：本地/桌面默认 `127.0.0.1`；容器部署用 `0.0.0.0` 但配合安全组隔离；`docs_enabled` 默认随 `env != "local"` 关闭。

#### M4. 前端令牌存放于 `localStorage`
- **位置**：`src/services/authService.ts:35-38`、`src/services/apiClient.ts:22`
- **影响**：access/refresh token 存于 `localStorage`，一旦发生 XSS 即可被读取外带。
- **修复**：Tauri 形态优先使用内存态 + 安全存储（`@tauri-apps/plugin-store` 或系统钥匙串）保存 refresh token，access token 仅驻内存；纯 Web 形态考虑 httpOnly Cookie。

### 🟢 低 / 健壮性（Low）

| 编号 | 位置 | 说明 | 建议 |
| --- | --- | --- | --- |
| L1 | `backend/app/modules/runner/router.py:192`（`/stream`）| SSE 用 Authorization 头鉴权，浏览器 `EventSource` 无法带自定义头，前端实际无法消费 | 改为 query token 一次性票据，或用 fetch + ReadableStream |
| L2 | `src/services/apiClient.ts` | access token 30 分钟过期后无自动刷新，`refreshSession` 未接入 | ✅ 已修复（见 §三.5） |
| L3 | `src/pages/auth/ForgotPasswordPage.tsx` | 页面未接任何 API，后端也无重置密码端点 | ✅ 已修复（见 §三.5） |
| L4 | `src/pages/workspace/SettingsPage.tsx` | 账号区为硬编码假数据（"张明…最后同步 3 分钟前"） | ✅ 已修复（见 §三.5） |
| L5 | `.gitignore` | 未忽略 `backend/*.db`，`agentpro_local.db` 处于未跟踪状态 | `.gitignore` 增加 `backend/*.db` |
| L6 | `VITE_AGENTPRO_MOCK_API` | mock fallback 返回假用户/假会话，误开会掩盖真实错误 | ✅ 已修复（见 §三.5） |
| L7 | `app/db/models.py:324`（`AuditLog`） | 审计表已建模但未见写入 | 在高风险动作处落审计日志 |

---

## 三、本次已完成的修复

> 以下为本轮已落地的代码改动（前端构建 `npm run build`✓、类型检查✓、后端 `pytest` 14/14✓）。

### 1. 需求一：对话「思考动画 + 打字机效果」✅
- 新增可复用组件：
  - `src/components/common/TypingIndicator.tsx`：三点「正在思考」动画（消息生成期间显示）。
  - `src/components/common/Typewriter.tsx`：`useTypewriter` Hook + `TypewriterText` 组件，基于 `requestAnimationFrame` 逐字输出并带闪烁光标。
- `src/pages/workspace/ChatPage.tsx`：
  - 发送后乐观渲染用户气泡 → 显示「正在思考」动画气泡 → 助手回复以打字机效果输出（仅最新一条动画，历史消息瞬时渲染）。
  - 自动滚动跟随输出；发送按钮发送中显示 spinner；读取需求时改用带 spinner 的 `LoadingState`。

### 2. 需求二：全站 Loading 效果补齐 ✅
- 新增基础组件：`src/components/common/Spinner.tsx`、`LoadingState.tsx`；`AppButton` 新增 `loading` 属性（自动显示 spinner 并禁用）。
- 新增 CSS 动画（`src/styles.css`）：`agent-bounce`、`agent-caret`、`agent-fade-in`，并在 `tailwind.config.ts` 注册；同时加入 `prefers-reduced-motion` 降级。
- 覆盖页面：登录、注册（发送验证码 + 提交）、模型配置 Setup（获取模型 + 保存）、需求库、AgentSpec（生成 + 审批/存档分别独立 spinner）、评审（采纳/返工独立 spinner）、反问确认、开发调度、监控（任务读取）、设置（模型配置读取）。

### 3. 测试隔离修复（顺带修复的真实缺陷）✅
- `backend/tests/conftest.py` 新增 `_hermetic_settings` autouse fixture：测试期间清空 SMTP 配置、使用测试专用 JWT 密钥、清理 `get_settings` 缓存。
- **修复前**：测试读取真实 `.env`，每次运行都会连接生产 SMTP 真实发信，并导致 9/14 用例失败。
- **修复后**：测试不再触网，14/14 全部通过。

### 4. P0 安全加固（持续落地，逐项提交）✅ 进行中

> 在上述基线上按安全审查清单逐项加固，每项独立提交并同步本文档。

- **H1 + M3｜配置安全默认值**（`backend/app/core/config.py`、`app/main.py`、`.env.example`）
  - 新增 `model_validator`：非 `local/test` 环境若 `jwt_secret` 为公开默认值或 <32 字符则**拒绝启动**（消除伪造登录态风险）。
  - `api_host` 默认改为 `127.0.0.1`（容器/服务器显式设 `0.0.0.0`，Docker CMD 已带 `--host`，部署不受影响）。
  - `docs_enabled` 改为三态（`None` 时按环境推导：local/test 开、其余关），新增 `docs_effective` 属性，`main.py` 改用之。
  - 新增 `tests/test_config_security.py`（5 项），全套 **19/19 通过**。

- **H2｜数据加密密钥与 JWT 密钥分离**（`backend/app/core/crypto.py`、`config.py`、`.env.example`）
  - 新增独立 `AGENTPRO_SECRET_ENC_KEY`；用 `MultiFernet` 实现惰性密钥轮换：加密用主密钥（优先 `secret_enc_key`），解密依次尝试所有密钥。
  - 旧密文（JWT 密钥派生）在引入新密钥后**仍可解密**，下次保存自动改用新密钥，**无需停机迁移**；留空则与旧行为一致。
  - 新增 `tests/test_crypto.py`（2 项，含旧密文兼容性），全套 **21/21 通过**。

- **H3｜出站请求 SSRF 防护**（`backend/app/core/net.py`，应用于 `models/router.py`、`requirements/ai_service.py`）
  - 新增 `assert_safe_outbound_url`：拒绝非 http(s) 协议，并解析目标主机，命中私有/回环/链路本地（含云元数据 `169.254.169.254`）/保留/组播/未指定地址即拒绝。
  - 在 `fetch_openai_model_names` 与 `call_openai_chat_completion` 发起请求前调用；httpx 默认不跟随重定向，避免重定向绕过。
  - 残留风险：解析与连接之间存在 TOCTOU / DNS-rebinding 窗口，如需更强保证应固定已解析 IP 再连接（已在代码与本文档标注）。
  - 新增 `tests/test_net.py`（4 项），全套 **33/33 通过**。

- **M2｜评审创建补 spec 归属校验**（`backend/app/modules/review/router.py`）
  - `create_review` 中对 `specId` 经其 `requirement.user_id` 间接校验所属用户，跨用户引用返回 404，消除通过猜测 specId 探测他人 spec 的轻度越权。
  - 新增 `tests/test_review.py::test_review_rejects_other_users_spec`，全套 **34/34 通过**。

- **M1｜登录限速与失败锁定**（`backend/app/core/ratelimit.py`、`app/modules/auth/router.py`、`config.py`）
  - 新增 `SlidingWindowLimiter`：按 `IP|账号` 计失败次数，默认 5 次/300 秒触发 429 锁定，登录成功即清零（合法用户偶尔输错不受影响）。
  - 阈值可配置（`AGENTPRO_LOGIN_MAX_FAILURES` / `AGENTPRO_LOGIN_LOCK_SECONDS`）。
  - 当前为**单实例内存实现**，适配桌面后端；多实例服务端需改用 Redis 共享窗口（见后续计划 P2/P3）。
  - 新增 `tests/test_auth.py` 两项（锁定与成功清零），全套 **36/36 通过**。

> 至此 P0 中除 **C1（手动轮换凭据）** 外的代码项（H1/H2/H3/M1/M2/M3 + 配套）均已完成。

### 5. P1 功能补全（持续落地，逐项提交）✅ 进行中

- **L3｜找回密码闭环**（`backend/app/modules/auth/`、`src/pages/auth/ForgotPasswordPage.tsx`、`src/services/authService.ts`）
  - 后端新增 `POST /auth/password-reset/confirm`：校验 `purpose="reset"` 验证码、更新密码哈希，并**吊销该用户全部有效刷新令牌**；发码复用 `/auth/email-code`。
  - 前端 `ForgotPasswordPage` 从静态占位改为可用表单：邮箱 + 发送验证码（冷却 + spinner）、验证码、新密码/确认、前端校验、本地调试码自动填入，成功后跳登录。
  - 新增 `tests/test_auth.py` 两项（重置成功改密 + 无效验证码 400），全套 **38/38 通过**。

- **L4｜设置页真实账号信息**（`src/pages/workspace/SettingsPage.tsx`、`src/services/authService.ts`）
  - 新增 `getCurrentUser`（`GET /auth/me`）；设置页改为展示真实用户名/邮箱/验证状态，含 loading 与错误态，移除「张明 / 最后同步 3 分钟前」等硬编码假数据。

- **L2｜Token 自动续期**（`src/services/apiClient.ts`）
  - 新增 `authedFetch`：请求遇 401（非 `/auth/*`）时用 refresh token 自动续签并重放一次；`ensureRefreshed` 对并发 401 去重为单次 `/auth/refresh`；刷新失败清空本地令牌。
  - 残留：刷新失败后的「自动跳转登录页」需 App 级鉴权守卫配合（见 P3）。

- **L6｜Mock 开关治理**（`src/services/apiClient.ts`）
  - `VITE_AGENTPRO_MOCK_API` 仅在 `import.meta.env.DEV` 生效，生产构建强制忽略，并在控制台显著告警，避免假数据掩盖真实错误流入生产。

---

## 四、必须立即执行的动作

> 这些动作涉及外部凭据/账号，无法由代码改动完成，需要你手动处理。**按优先级排序：**

1. **轮换全部生产凭据（最高优先级）**
   - 阿里云 RDS：重置 `agentpro` 账号密码（当前为弱口令），并收紧该账号的来源 IP 白名单。
   - 重新生成 `AGENTPRO_JWT_SECRET`（≥32 字节随机串，`python -c "import secrets;print(secrets.token_urlsafe(48))"`）。轮换会使现有登录态失效，属预期。
   - 重置腾讯企业邮 SMTP 密码。
2. **将密钥迁出 `.env` 文件**：生产改用环境变量注入 / 阿里云 KMS / Docker secrets，仓库只保留 `.env.example` 占位。
3. **确认 `.env` 与本地库未外泄**：核对 CI、镜像层、备份中不含 `backend/.env` 与 `agentpro_local.db`；`.gitignore` 增补 `backend/*.db`。
4. **上线前完成 H1/H2/H3、M1~M3 的代码修复**（详见后续开发计划 P0）。

---

## 五、复核命令

```bash
# 前端
npm run typecheck && npm run build

# 后端（在 backend/ 下）
.venv/bin/python -m pytest -q

# 凭据历史核查（应为空）
git log --all -p -S "582018Mysql" --oneline
git log --all --full-history -- backend/.env
```
