# AgentPro Workflow 与界面展示优化方案

## 目标

本方案用于优化 AgentPro 当前的产品工作流和页面展示，让技术小白用户可以更顺畅地完成：

1. 描述业务想法。
2. 被 Agent 开发助手主动反问和补全需求。
3. 审批 AgentSpec。
4. 选择 Codex/Claude Code 或并行开发。
5. 观察真实开发过程。
6. 查看自动评审结果。
7. 决定采纳、返工、合并优点或存档。

核心原则：

- 用户不需要理解“页面路由”，只需要知道“当前 Agent 需求走到哪一步”。
- 每一步都要给出明确的下一步动作。
- 页面展示要围绕一个 Agent 项目展开，而不是让用户在多个孤立页面之间猜测状态。
- 保留现有 HTML 设计稿的左侧 56px 图标侧栏、白底卡片、蓝色主色、轻量科技感和 HeroUI 风格。
- 先优化 workflow 和状态表达，再做更多功能堆叠。

## 当前 Workflow 诊断

### 当前真实路径

当前代码中的主路径是：

```text
登录 / 注册
  -> 首次模型配置
  -> 需求访谈 Chat
  -> 反问确认 Followup
  -> AgentSpec 草案 Spec
  -> 审批 / 存档
  -> 开发调度 Dispatch
  -> 并行监控 Monitor
  -> 自动评审 Review
  -> 采纳 / 返工 / 合并优点
  -> 需求库 Library
```

对应入口：

- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
- `src/pages/workspace/ChatPage.tsx`
- `src/pages/workspace/FollowupPage.tsx`
- `src/pages/workspace/SpecPage.tsx`
- `src/pages/workspace/DispatchPage.tsx`
- `src/pages/workspace/MonitorPage.tsx`
- `src/pages/workspace/ReviewPage.tsx`
- `src/pages/workspace/LibraryPage.tsx`

### 当前主要问题

1. **流程被拆成多个页面，但缺少统一阶段感**
   - 用户看到的是“需求访谈、需求草案、开发调度、监控、评审”等页面。
   - 但技术小白更需要的是“下一步该做什么”。
   - 顶部栏只有页面标题，没有显示整体进度。

2. **关键 ID 状态只保存在 `App.tsx` 本地 state**
   - `activeRequirementId`、`activeSpecId`、`activeJobId`、`activeReviewId` 都是局部状态。
   - 刷新后 workflow 上下文容易丢。
   - 需求库、侧栏、监控、评审无法形成稳定的“项目上下文”。

3. **Chat 和 Followup 分裂感较强**
   - 用户在 Chat 中看到反问后，需要点击“回答反问”跳到另一个页面。
   - 对技术小白来说，反问应该是对话的一部分，而不是单独流程页面。

4. **Spec 页面存在隐式写操作**
   - 进入 Spec 页面会自动调用生成接口。
   - 用户只是查看页面，却可能生成新版本。
   - UI 上也没有展示“这是最新草案 / 这是历史版本 / 是否重新生成”。

5. **开发调度与监控割裂**
   - Dispatch 页面创建 job 后等待真实执行完成才进入 Monitor。
   - Monitor 页面目前更像任务快照，不像真实开发过程。
   - 用户看不到“Codex 和 Claude 分别在做什么、谁领先、谁失败、产生了什么证据”。

6. **Review 页面默认自动创建报告**
   - 用户进入页面就创建评审，容易重复。
   - 缺少“评审依据”和“我为什么应该采纳这个方案”的可解释层。

7. **需求库不像 workflow hub**
   - 目前需求库是表格列表。
   - 筛选按钮只是展示样式，未形成“下一步操作队列”。
   - 更适合作为用户回到工作状态的入口，但目前没有充分承担这个角色。

## 优化后的产品模型

建议把 AgentPro 的核心概念从“多个功能页面”调整为：

```text
Agent Project
  -> Workflow Stage
  -> Next Action
  -> Evidence
```

### Agent Project

每个用户想做的 Agent 都是一个项目。项目包含：

- Requirement
- Conversation
- Followup decisions
- AgentSpec
- DevJob
- Runner artifacts
- Review report
- Audit logs

### Workflow Stage

统一阶段建议：

| 阶段 | 状态 key | 用户理解 | 主页面 |
| --- | --- | --- | --- |
| 1 | `intake` | 说清楚想法 | Chat |
| 2 | `clarify` | 回答关键反问 | Chat 内反问卡 / Followup |
| 3 | `spec_draft` | 查看需求草案 | Spec |
| 4 | `approval` | 确认是否开发 | Spec |
| 5 | `dispatch` | 选择开发方式 | Dispatch |
| 6 | `building` | 等待 Codex/Claude 开发 | Monitor |
| 7 | `reviewing` | 查看自动评审 | Review |
| 8 | `decision` | 采纳、返工、合并优点、存档 | Review / Library |
| 9 | `archived` | 已归档 | Library |

### Next Action

每个阶段只给用户一个主按钮：

- `继续描述需求`
- `回答反问`
- `生成 AgentSpec`
- `确认并开发`
- `开始并行开发`
- `查看开发进度`
- `生成评审报告`
- `采纳推荐方案`

辅助按钮保留，但降级为次要操作：

- `继续澄清`
- `暂时存档`
- `重新生成`
- `要求返工`
- `合并优点`

### Evidence

每一步都要展示“系统为什么这么建议”：

- 需求成熟度来自哪些回答。
- AgentSpec 来自哪些确认项。
- 开发任务使用了哪个 spec version。
- Runner 产物有哪些测试结果。
- 自动评审引用了哪些日志、diff、测试报告、风险项。

## 推荐的新 Workflow

### Workflow 1：首次用户

```text
登录 / 注册
  -> 模型配置
  -> Runner 检测
  -> 进入 Agent Builder 工作台
  -> 创建第一个 Agent 项目
```

优化点：

- 模型配置完成后不要直接只进入普通 Chat。
- 增加一个轻量的“环境就绪检查”：
  - 模型连接：已配置 / 未配置
  - Codex CLI：可用 / 未检测
  - Claude Code CLI：可用 / 未检测
  - 安全模式：已开启
- 对技术小白来说，这一步能减少后续“为什么不能开发”的疑惑。

### Workflow 2：需求访谈

```text
用户输入想法
  -> Agent 实时总结
  -> 右侧显示成熟度、缺口、风险
  -> Agent 主动提出反问
  -> 用户直接在对话中回答
  -> 满足条件后出现“生成 AgentSpec”
```

界面建议：

- 保留当前三栏结构：
  - 左：需求列表
  - 中：对话
  - 右：需求状态与下一步
- 将 Followup 的主要能力内嵌到 Chat 页：
  - 在对话流中展示“反问卡片”。
  - 每张卡片可以选择“直接回答 / 稍后确认 / 不适用”。
  - 右侧面板显示待确认问题数量。
- Followup 页面可以保留，但定位改为“批量确认面板”，不是必经页面。

### Workflow 3：AgentSpec 审批

```text
生成草案
  -> 查看草案
  -> 查看未确认假设
  -> 查看安全边界
  -> 用户选择：确认并开发 / 继续澄清 / 暂时存档
```

界面建议：

- Spec 页顶部增加版本与来源：
  - `AgentSpec v3`
  - `基于 8 轮对话生成`
  - `最后更新 10:32`
  - `使用模型 gpt-5.5`
- 右侧审批区增加“审批前检查”：
  - 业务目标明确
  - 权限边界明确
  - 输入输出明确
  - 失败处理明确
  - 验收标准明确
- 重新生成必须是显式按钮：
  - `重新生成草案`
  - 点击后弹窗提示会创建新版本。
- 默认进入 Spec 页时先读取 latest spec，不自动生成。

### Workflow 4：开发调度

```text
已审批 AgentSpec
  -> 检查开发前置条件
  -> 选择开发策略
  -> 创建 job
  -> 立即进入 Monitor
```

界面建议：

- Dispatch 页面不要等待真实开发完成。
- 按“前置条件 -> 策略选择 -> 执行摘要 -> 启动”展示。
- 前置条件建议显示：
  - AgentSpec 已审批
  - 模型配置可用
  - Codex Runner 可用
  - Claude Code Runner 可用
  - 本地 workspace 可写
  - 安全扫描开启
- 策略卡建议：
  - `Codex 快速实现`
  - `Claude 深度实现`
  - `并行候选实现（推荐）`
- 点击后立即创建 job 并跳转 Monitor。

### Workflow 5：并行开发监控

```text
job 已创建
  -> Codex lane running
  -> Claude lane running
  -> 实时日志
  -> 测试结果
  -> 产物摘要
  -> 进入 Review
```

界面建议：

- Monitor 页改成“双 lane 看板”：
  - 左：Codex Runner
  - 右：Claude Code Runner
- 每个 lane 展示：
  - 当前阶段
  - 进度
  - 最近日志
  - 测试状态
  - commit hash
  - artifact 数量
  - 错误状态
- 页面底部或右侧增加“事件流”：
  - `system`
  - `codex`
  - `claude`
  - `test`
  - `artifact`
- 只有 job 到达 terminal state 后，主按钮才从 `等待开发完成` 变成 `查看评审报告`。

### Workflow 6：自动评审

```text
开发完成
  -> 自动评审读取 AgentSpec + artifacts + logs + tests
  -> 输出候选对比
  -> 输出风险列表
  -> 输出推荐动作
  -> 用户决策
```

界面建议：

- Review 页面分成四块：
  - 顶部：总评和推荐动作
  - 中部：Codex vs Claude 对比表
  - 中部：评分雷达或维度条
  - 底部：证据列表与风险发现
- 每个 finding 必须标明来源：
  - `来自测试报告`
  - `来自 Runner 日志`
  - `来自 AgentSpec 安全边界`
  - `来自 diff 静态检查`
- 主按钮按推荐排序：
  - `采纳推荐方案`
  - `合并优点后返工`
  - `要求重新开发`
  - `暂时存档`

### Workflow 7：需求库作为工作流 Hub

```text
用户打开需求库
  -> 看到所有 Agent 项目的阶段
  -> 点击“继续”进入对应下一步
```

界面建议：

- 需求库不只是表格，应变成工作流入口。
- 每一行增加“下一步”列：
  - 访谈中：`继续访谈`
  - 可生成：`生成草案`
  - 草案中：`去审批`
  - 已审批：`去开发`
  - 开发中：`看进度`
  - 评审中：`看评审`
  - 已完成：`查看结果`
- 顶部筛选建议：
  - `全部`
  - `需要我处理`
  - `开发中`
  - `评审中`
  - `已完成`
  - `已归档`
- 增加 summary cards：
  - 当前进行中
  - 等待审批
  - 开发中
  - 高风险需求

## 全局界面结构优化

### 左侧导航

当前左侧导航是功能页面导航。建议保留 56px 图标侧栏，但弱化“页面集合”，强化“工作区入口”：

推荐导航：

| 图标 | 名称 | 说明 |
| --- | --- | --- |
| A | Agent Builder | 当前项目工作台，包含访谈、Spec、开发、评审 |
| Folder | 需求库 | 所有项目与下一步动作 |
| Monitor | Runs | 所有开发任务与日志 |
| BarChart | Reviews | 所有评审报告 |
| Settings | 设置 | 模型、Runner、安全、账号 |

说明：

- `Chat / Followup / Spec / Dispatch / Monitor / Review` 不一定都要作为一级导航。
- 它们更适合作为同一个 Agent Project 的内部阶段。
- 当前设计稿的图标侧栏可以保留，但 tooltip 要更明确。

### 顶部栏

当前顶部栏只显示页面标题和用户信息。建议改为：

```text
当前项目名称 / 当前阶段 / 下一步动作 / 用户
```

示例：

```text
智能客服 Agent    阶段：AgentSpec 待审批    下一步：确认并开发
```

组件建议：

- 项目选择器：当前 Agent 项目，可切换。
- 阶段状态 chip：访谈中 / 待审批 / 开发中 / 评审中。
- 全局通知：Runner 失败、模型连接失败、评审完成。
- 用户菜单：账号、设置、退出。

### 阶段条

在工作台类页面顶部增加固定阶段条：

```text
需求访谈 -> 反问确认 -> AgentSpec -> 审批 -> 开发 -> 评审 -> 完成
```

状态：

- 已完成：蓝色实心
- 当前：蓝色描边 + 动效
- 阻塞：橙色
- 失败：红色
- 未开始：灰色

这比单纯左侧导航更适合技术小白理解流程。

### 右侧智能助手面板

建议统一右侧面板为“下一步与证据”：

- 当前阶段目标
- 系统建议
- 缺失信息
- 风险提醒
- 下一步主按钮
- 最近一次 AI 总结

这样 Chat、Spec、Dispatch、Review 的右侧面板都有统一逻辑，用户不会每页重新学习。

## 推荐新增前端状态模型

建议新增 `workflowStore`，不要继续把核心 workflow ID 放在 `App.tsx` 局部 state。

建议字段：

```ts
interface WorkflowState {
  activeRequirementId: string | null;
  activeSpecId: string | null;
  activeJobId: string | null;
  activeReviewId: string | null;
  stage:
    | "intake"
    | "clarify"
    | "spec_draft"
    | "approval"
    | "dispatch"
    | "building"
    | "reviewing"
    | "decision"
    | "archived";
  nextAction: string | null;
  blockers: Array<{
    code: string;
    message: string;
    route?: string;
  }>;
}
```

状态来源：

- `Requirement.status`
- latest `AgentSpec.status`
- latest `DevJob.status`
- latest `ReviewReport.status`

映射规则：

| 后端状态 | 前端 stage | 默认路由 | 主按钮 |
| --- | --- | --- | --- |
| `interviewing` | `intake` / `clarify` | chat | 继续访谈 |
| `ready_for_spec` | `spec_draft` | spec | 生成 AgentSpec |
| `spec_draft` | `approval` | spec | 确认并开发 |
| `approved` | `dispatch` | dispatch | 选择开发方式 |
| `queued/running` | `building` | monitor | 查看开发进度 |
| `completed` | `reviewing` | review | 查看评审报告 |
| `accepted/merge_planned/rework_requested` | `decision` | review | 处理评审结论 |
| `archived` | `archived` | library | 查看归档 |

## 页面级优化方案

### ChatPage

保留：

- 左需求列表
- 中间对话
- 右侧成熟度与建议
- token 流式展示

优化：

- 反问问题直接变成对话内卡片，支持内联回答。
- 右侧增加“下一步”主按钮：只有成熟度达标或无阻塞项时展示 `生成 AgentSpec`。
- 成熟度不只展示百分比，还展示缺失维度：
  - 目标
  - 用户
  - 输入输出
  - 权限
  - 工具
  - 验收
  - 风险
- 空状态从“从一个想法开始”升级为“模板起步”：
  - 客服 Agent
  - 数据分析 Agent
  - 运营助手
  - 内部流程自动化

### FollowupPage

保留：

- 批量确认能力。

优化：

- 从一级流程页降级为“批量确认视图”。
- 入口从 Chat 右侧 `批量确认` 打开。
- 如果没有待确认项，不要显示空页面，直接提示返回 Chat 或生成 Spec。

### SpecPage

保留：

- 草案正文
- 安全边界
- 未确认假设
- 审批动作

优化：

- 默认调用 `getAgentSpec` 或 latest spec，不自动 generate。
- 加版本历史入口。
- 加“重新生成”按钮，并明确会创建新版本。
- 每个模块旁边显示来源：
  - 来自对话
  - 来自反问确认
  - 来自模型推断
  - 需要人工确认
- 右侧审批前检查从静态完整度改为 checklist。

### DispatchPage

保留：

- 策略卡
- 执行计划
- 准备状态

优化：

- 准备状态必须来自真实检测，不要静态写“可用”。
- 开发开始后立即进入 Monitor。
- 策略卡显示更清楚：
  - 速度
  - 稳定性
  - 成本
  - 推荐场景
- 如果某个 Runner 不可用，对应策略置灰，并给出修复入口。

### MonitorPage

保留：

- Codex / Claude 双卡片。

优化：

- 改成左右双 lane。
- 每个 lane 有独立状态、日志、测试、artifact。
- 增加全局事件流。
- 增加“暂停 / 取消 / 重试失败引擎”。
- 如果 job 失败，主按钮变成 `查看失败原因` 或 `重新调度`。

### ReviewPage

保留：

- 总评分
- 幻觉风险
- 稳定性
- 性能
- findings

优化：

- 默认读取 latest review，不自动创建。
- 显示评审证据来源。
- 增加 Codex vs Claude 对比表：
  - 完成度
  - 测试结果
  - 代码风险
  - 安全风险
  - 性能风险
  - 推荐理由
- 操作按钮按风险排序：
  - 高置信：采纳推荐
  - 中置信：合并优点后返工
  - 低置信：要求重新开发

### LibraryPage

保留：

- 需求列表。

优化：

- 筛选按钮真实可用。
- 增加“需要我处理”视图。
- 增加下一步列。
- 点击行默认跳到下一步，不是只按静态 route。
- 加 summary cards 作为工作台入口。

### SettingsPage

优化重点：

- 模型配置：显示连接状态、最后测试时间、当前模型。
- Runner 配置：显示本地 CLI 检测、版本、登录状态。
- 安全设置：显示是否开启审计、密钥保护、命令白名单、Runner workspace。
- 增加“环境检查”按钮，一键检测模型和 Runner。

## 视觉展示规范

### 页面密度

AgentPro 的用户是技术小白，但任务本身偏工程流程。界面应该保持：

- 信息足够清楚
- 层级明确
- 不做营销式大 Hero
- 不堆装饰插图
- 以卡片、表格、阶段条、右侧建议面板为主

### 色彩

保留当前蓝色系，但避免全页面单一蓝：

- 主色：蓝色，用于主按钮、当前阶段、重要链接。
- 成功：绿色，用于已完成、可用、通过。
- 警告：橙色，用于待确认、风险、阻塞。
- 危险：红色，用于失败、越权、安全问题。
- 信息底色：浅蓝、浅灰、浅绿、浅橙分层使用。

### 组件建议

HeroUI 可优先用于：

- `Tabs`：需求库筛选、Review 证据分类。
- `Progress`：阶段进度、成熟度、Runner 进度。
- `Chip`：状态展示。
- `Modal`：重新生成、采纳、返工等确认。
- `Drawer`：批量反问确认、日志详情。
- `Tooltip`：左侧图标导航说明。
- `Accordion`：评审发现、证据详情。
- `Table`：需求库、候选对比。
- `Dropdown`：项目切换、用户菜单。

### 不建议的展示

- 不建议把每个流程都做成独立大页面。
- 不建议用大段说明文字教育用户。
- 不建议把“技术细节日志”直接堆在主视图。
- 不建议让用户在多个按钮里猜主路径。
- 不建议每个页面都有不同的右侧面板逻辑。

## 实施顺序

### 阶段 1：Workflow Store 与阶段映射

目标：

- 把 `activeRequirementId`、`activeSpecId`、`activeJobId`、`activeReviewId` 从 `App.tsx` 迁到 Zustand。
- 增加 stage 和 nextAction 映射。
- 刷新后能恢复当前项目上下文。

影响文件：

- `src/App.tsx`
- `src/stores/workflowStore.ts`
- `src/services/types.ts`
- `src/components/layout/AppShell.tsx`

验收：

- 刷新页面后仍能保留当前需求上下文。
- 顶部栏能显示当前项目和阶段。
- 需求库点击项目后进入正确下一步。

建议 commit：

```bash
git commit -m "优化工作流状态管理与阶段映射"
```

### 阶段 2：统一阶段条与下一步面板

目标：

- 在工作台页面增加统一阶段条。
- 把右侧面板统一为“下一步与证据”。

影响文件：

- `src/components/layout/AppShell.tsx`
- `src/components/layout/WorkflowStepper.tsx`
- `src/components/layout/NextActionPanel.tsx`
- `src/pages/workspace/ChatPage.tsx`
- `src/pages/workspace/SpecPage.tsx`
- `src/pages/workspace/DispatchPage.tsx`
- `src/pages/workspace/ReviewPage.tsx`

验收：

- 用户在任何核心页面都能看到当前阶段。
- 每个阶段只有一个清晰主动作。
- 阻塞项和风险项有明确说明。

建议 commit：

```bash
git commit -m "新增统一工作流阶段条与下一步面板"
```

### 阶段 3：访谈与反问体验合并

目标：

- 将反问确认前移到 Chat 对话流中。
- Followup 页面保留为批量确认。

影响文件：

- `src/pages/workspace/ChatPage.tsx`
- `src/pages/workspace/FollowupPage.tsx`
- `src/components/workflow/FollowupQuestionCard.tsx`

验收：

- 用户可以在 Chat 页直接回答反问。
- 批量确认入口仍可用。
- 回答后右侧成熟度与下一步动作更新。

建议 commit：

```bash
git commit -m "优化需求访谈与反问确认体验"
```

### 阶段 4：Spec 与 Review 幂等展示

目标：

- Spec 和 Review 页面不再因为打开页面产生重复记录。
- 加入版本、来源和证据展示。

影响文件：

- `src/pages/workspace/SpecPage.tsx`
- `src/pages/workspace/ReviewPage.tsx`
- `src/services/agentSpecService.ts`
- `src/services/reviewService.ts`
- 后端 latest spec/latest review 接口

验收：

- 反复进入 Spec 页不新增 AgentSpec。
- 反复进入 Review 页不新增 ReviewReport。
- 用户能看到 spec version 和 review evidence。

建议 commit：

```bash
git commit -m "优化 AgentSpec 与评审报告的幂等展示"
```

### 阶段 5：Dispatch 与 Monitor 真实过程展示

目标：

- 创建 job 后立即进入 Monitor。
- Monitor 显示两路候选真实状态、日志和 artifact。

影响文件：

- `src/pages/workspace/DispatchPage.tsx`
- `src/pages/workspace/MonitorPage.tsx`
- `src/services/runnerService.ts`
- 后端 runner stream/事件接口

验收：

- 点击开始开发后 1 秒内进入 Monitor。
- Codex/Claude lane 可以独立展示 running/completed/failed。
- 日志实时追加，不需要刷新页面。

建议 commit：

```bash
git commit -m "优化开发调度与并行监控工作流"
```

### 阶段 6：需求库升级为 Workflow Hub

目标：

- 需求库从列表升级为工作台入口。

影响文件：

- `src/pages/workspace/LibraryPage.tsx`
- `src/components/workflow/RequirementStatusSummary.tsx`
- `src/components/workflow/NextActionButton.tsx`

验收：

- 筛选真实可用。
- 每条需求都有下一步按钮。
- 用户可以从需求库恢复任意 Agent 项目。

建议 commit：

```bash
git commit -m "升级需求库为工作流入口"
```

## 最小可落地版本

如果希望先做一个小版本，不一次性大改，建议只做三件事：

1. 新增 `workflowStore`，持久化当前项目 ID 和阶段。
2. AppShell 顶部增加阶段条和下一步按钮。
3. 需求库增加“下一步”列，点击后进入正确页面。

这三件事能最快改善用户对整体流程的理解，也不会立即牵动 Runner 后端重构。

## 与代码审查报告的关系

本方案偏产品 workflow 与界面展示。它必须和 `docs/Codex代码审查报告与后续开发计划.md` 中的安全修复顺序配合：

- P0 DevJob ownership 校验仍然必须优先。
- Tauri Runner 路径安全仍然必须在真实开放 Runner 前修复。
- Spec/Review 幂等既是安全审查问题，也是本方案的关键体验问题。
- Dispatch/Monitor 的异步并行改造既是工程问题，也是界面工作流问题。

因此建议开发顺序为：

1. P0 安全修复。
2. Workflow Store 与阶段条。
3. Spec/Review 幂等。
4. Dispatch/Monitor 异步与实时展示。
5. Chat/Followup 合并体验。
6. 需求库 Hub。

## 下一刀

建议先切 `workflowStore + 阶段映射 + 顶部阶段条`。

理由：

- 这是界面 workflow 优化的基础。
- 不依赖 Runner 后端重构。
- 能立即解决当前页面割裂、刷新丢上下文、用户不知道下一步的问题。
- 后续 Chat、Spec、Dispatch、Monitor、Review 都能复用同一套 stage 和 nextAction。

入口：

- `src/App.tsx`
- `src/stores/workflowStore.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/WorkflowStepper.tsx`
- `src/pages/workspace/LibraryPage.tsx`
