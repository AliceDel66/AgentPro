# AgentPro Agent 交付与使用设计（需求4）

> 目标：解决"开发完成的 Agent 如何交付给用户使用"。核心思路是**在需求访谈阶段就确定"交付形态"**，
> 让它成为 AgentSpec 的一部分，驱动开发阶段预留对应接口，并决定完成后的使用方式。

## 一、核心概念：交付形态（deliveryTarget）

访谈时主动询问用户，Agent 完成后打算怎么用。三类形态：

| 形态 | 说明 | 开发期预留 | 使用方式 |
| --- | --- | --- | --- |
| `in_app` 软件内使用 | Agent 在 AgentPro 内运行，调度**软件内配置的 AI 模型服务** | 标准 `run(input)->output` 入口 | 侧栏"我的 Agent"→ 进入对话/运行页 |
| `external` 外部集成 | 接入飞书机器人 / 企业微信 / Slack / openclaw 等 | webhook handler + 平台适配层 | 在第三方平台触发 |
| `standalone` 独立后台 | 独立进程/定时任务/守护，可连外部消息平台推送 | 可独立运行的 entry + 配置 + 推送 connector | 后台运行，结果推送 |

> 关键不变量：选 `in_app` 时，Agent 调度的 AI 即软件内 model config（用户已在设置页配置的大模型服务），
> 不需要用户二次配置。

## 二、各阶段改动

### 1. 需求访谈阶段（最先做）
- AI 系统提示词新增一个澄清维度 `delivery_target`，在反问中主动问：
  「这个 Agent 你打算在 AgentPro 内直接使用，还是接入飞书/企业微信等外部平台，或作为独立后台运行？」
- 用户的回答写入 `AgentSpec.body.deliveryTarget`（`in_app` / `external` / `standalone`），
  以及对应的连接器（如 `external` 时记录目标平台：飞书/企业微信/…）。
- 右侧成熟度面板把"交付形态"作为一个必确认维度。

### 2. AgentSpec 阶段
- Spec 正文新增"交付形态"区块：展示 deliveryTarget + 预留接口说明。
- 开发前安全约束按形态收敛（如 external 需要 webhook 鉴权、standalone 需要凭据隔离）。

### 3. 开发调度 / Runner 阶段
- DevJob 的 prompt 注入 deliveryTarget，要求生成对应入口：
  - `in_app`：暴露统一调用入口（约定 `agent.run(input)`，软件可直接 import/调用）。
  - `external`：生成 webhook handler + 指定平台的回调适配。
  - `standalone`：生成独立运行入口 + 调度/推送配置。
- Runner 默认在 `~/AgentPro/runs/<jobId>/<engine>/` 创建隔离工作区，用户可在设置页自定义保存目录。
- Runner 完成后必须生成 `agentpro-delivery.json` 交付清单，至少包含：
  - `deliverableType`：当前先使用 `agentpro_patch`，后续扩展为 `in_app_agent` / `external_connector` / `standalone_service`。
  - `entrypoints`：Runner 工作区、构建产物、README 或其他可打开入口。
  - `changedFiles` / `untrackedFiles`：源码修改和新增文件，避免只看 diff 而遗漏未跟踪文件。
  - `previewCommand`：本地预览或运行命令。
  - `buildArtifactMissing`：是否缺少可直接打开的构建产物。
- `agentpro-delivery.json` 通过 `delivery-manifest` artifact 回传后端，评审报告中的“本机交付结果”优先读取该清单。

### 4. 使用阶段（in_app，新增侧栏页）
- 侧栏新增「我的 Agent」入口（图标导航第 4 项之后）。
- 页面：列出所有"已采纳/已交付"的 Agent（requirement.status = accepted/delivered）。
- 每个 Agent 有「进入使用」→ Agent 运行页：
  - 用户输入 → 后端用该 Agent 的 spec + **软件内配置的 model** 执行 → 返回结果（流式，复用现有打字机/流式组件）。
  - 运行记录可留存（会话历史）。

## 三、数据与接口

- `AgentSpec.body.deliveryTarget`: `{ mode: "in_app"|"external"|"standalone", connectors?: string[] }`
- `DevJobArtifact.kind`: 新增 `delivery-manifest`，`payload` 为 `agentpro-delivery.json` 内容。
- `delivery-manifest.entrypoints`: `{ label: string, kind: "workspace"|"build"|"readme"|string, path: string }[]`
- 复用 `requirement.status`：新增 `delivered` 终态（采纳评审后可"交付"）。
- 新增后端：`GET /agents`（已交付 agent 列表）、`POST /agents/{id}/run`（in_app 执行，用 user 的 model config + spec）。
- 前端：`src/pages/workspace/AgentsPage.tsx`（我的 Agent）+ `AgentRunPage`（运行页）。

## 四、实施切片（从小到大，建议顺序）

1. **切片 A（小·可验证）**：访谈/Spec 增加 `deliveryTarget` 维度
   - 后端 AI 系统提示词加澄清项；spec body 写入 deliveryTarget；前端 Spec 页展示。
   - 入口：`backend/app/modules/requirements/ai_service.py`(SYSTEM_PROMPT)、`graph.py`、`SpecPage.tsx`。
2. **切片 B（中）**：侧栏「我的 Agent」列表页 + 进入使用页（先占位运行）
   - 入口：`AppShell.tsx` 导航、新增 `AgentsPage.tsx`、后端 `GET /agents`。
3. **切片 C（大）**：in_app Agent 真实运行（用配置的 model 执行 agent，流式返回）
   - 入口：后端 `POST /agents/{id}/run`、前端运行页复用流式组件。
4. **切片 D（大）**：external / standalone 的接口预留 + 平台适配（飞书等）

## 五、与现有工作流的衔接

- 交付形态在访谈期确定 → 贯穿 Spec / 开发 / 使用，避免"开发完不知道怎么用"。
- `in_app` 复用已配置的模型服务，零额外配置，最贴合"技术小白"定位，建议**优先做 in_app 全链路（切片 A→B→C）**。
- `external`/`standalone` 作为进阶能力，待 in_app 闭环后再扩展。
