import type { AppRoute } from "../types";

export const requirementSidebarItems = [
  { title: "自动客服 Agent", meta: "进行中 · 刚刚", active: true },
  { title: "数据报表生成器", meta: "草稿 · 5 小时前" },
  { title: "库存预警 Agent", meta: "草稿 · 3 天前" }
];

export const followupQuestions = [
  "这个 Agent 需要能直接操作订单系统（如自动发起退款），还是只做信息查询和引导？",
  "遇到无法处理的复杂问题时，希望怎样转接给人工客服？",
  "需要记住用户之前的对话历史吗？比如用户上次咨询过退货进度。"
];

export const libraryFilters = ["全部 (5)", "草稿 (1)", "已审批 (1)", "开发中 (1)", "评审中 (1)", "已归档 (1)"];

export const requirementLibraryRows: Array<{
  title: string;
  status: string;
  tone: "blue" | "gray" | "cyan" | "purple" | "green";
  updated: string;
  maturity: string;
  maturityTone?: string;
  method: string;
  score: string;
  route?: AppRoute;
}> = [
  { title: "自动客服 Agent", status: "评审中", tone: "purple", updated: "2 小时前", maturity: "87%", method: "Codex + Claude", score: "82", route: "review" },
  { title: "数据报表生成器", status: "开发中", tone: "cyan", updated: "5 小时前", maturity: "64%", method: "Claude Code", score: "—", route: "monitor" },
  { title: "智能排班助手", status: "已审批", tone: "blue", updated: "1 天前", maturity: "92%", method: "待选择", score: "—", route: "dispatch" },
  { title: "库存预警 Agent", status: "草稿", tone: "gray", updated: "3 天前", maturity: "35%", method: "—", score: "—", route: "chat" },
  { title: "供应商沟通 Agent", status: "已归档", tone: "green", updated: "1 周前", maturity: "100%", maturityTone: "text-agent-success", method: "Codex", score: "91" }
];

export const runnerSteps = ["创建隔离工作区", "读取需求文档", "代码实现", "运行测试", "提交候选方案"];

export const runnerLogs = [
  ["Codex", "12:34:21", "运行测试 test_refund_flow..."],
  ["Claude", "12:34:28", "生成候选提交 candidate/claude-code"],
  ["Codex", "12:35:04", "检查订单系统工具调用边界"],
  ["System", "12:35:20", "等待 Codex 候选完成后进入自动评审"]
] as const;

export const reviewDimensions = [
  ["功能完成度", 85, 92, false],
  ["测试覆盖", 78, 88, false],
  ["性能表现", 90, 85, false],
  ["稳定性", 82, 91, false],
  ["幻觉风险", 30, 15, true],
  ["安全风险", 20, 10, true],
  ["需求一致性", 88, 94, false]
] as const;

export const reviewFindings = [
  ["阻塞", "Codex 方案的退款操作缺少金额校验，存在幻觉导致的超额退款风险", "bg-agent-danger", "bg-[#FEF2F2]"],
  ["建议", "Claude 方案的错误提示信息可以更加用户友好，避免使用技术术语", "bg-agent-warning", "bg-[#FFF7ED]"],
  ["优点", "Claude 方案实现了完整的对话记忆机制，能准确关联历史订单信息", "bg-agent-success", "bg-[#ECFDF5]"]
] as const;
