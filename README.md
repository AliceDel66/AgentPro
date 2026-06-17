# AgentPro Desktop

AgentPro 是一个面向技术小白的桌面端 Agent 开发助手原型。当前版本实现了基于设计稿的前端页面、工作台主流程、统一 mock 数据、以及后端 API 服务层占位。

## 技术栈

- Tauri
- React
- TypeScript
- HeroUI
- Tailwind CSS
- Vite

## 启动项目

```bash
npm install
npm run dev
```

默认本地地址：

```text
http://127.0.0.1:5173/
```

生产构建：

```bash
npm run build
```

类型检查：

```bash
npm run typecheck
```

Lint 检查当前暂时复用 TypeScript 检查：

```bash
npm run lint
```

## 设计稿验收

设计稿文件：

```text
/Users/yaocheng/Downloads/AgentPro.dc.html
```

建议按 1440x900 视口逐页对照：

- 登录页、注册页、找回密码页
- 模型配置页
- 需求访谈页
- 反问确认页
- AgentSpec 草案页
- 需求库页
- 开发调度页
- 并行开发监控页
- 自动评审报告页
- 设置页

## 当前 Mock 边界

- 登录注册流程为前端 mock，未接真实验证码与账号系统。
- 模型连接测试与模型列表为 mock，服务层已预留接口。
- Agent 需求访谈、反问确认、AgentSpec 生成、存档与审批为 mock。
- Codex / Claude Code 调度、并行监控和自动评审结果为 mock。
- 云端数据库连接信息不应放在前端，后续应由后端服务读取安全配置。

## 安全约定

- 不提交 `.env`。
- 不提交数据库密码、API Key、真实用户隐私数据。
- 前端仅保存接口边界和脱敏展示，真实密钥应进入系统密钥链或后端安全存储。
