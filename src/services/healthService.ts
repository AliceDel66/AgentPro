import { apiGet } from "./apiClient";

export const DESKTOP_CONTRACT_VERSION = 2;

export const REQUIRED_BACKEND_CAPABILITIES = [
  "runner.desktop-local.v1",
  "runner.artifact.delivery-manifest.v1",
  "review.delivery-manifest-payload.v1",
  "review.action-plan.v1"
] as const;

export interface HealthPayload {
  status: "ok";
  service: string;
  version: string;
  contractVersion?: number;
  minDesktopContractVersion?: number;
  capabilities?: string[];
}

export interface BackendContractIssue {
  code: string;
  message: string;
}

export interface BackendContractCheck {
  compatible: boolean;
  title: string;
  message: string;
  issues: BackendContractIssue[];
  health: HealthPayload | null;
}

function hasContractNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateBackendContract(health: HealthPayload | null): BackendContractCheck {
  if (!health) {
    return {
      compatible: false,
      title: "无法读取后端版本",
      message: "桌面端没有拿到后端健康检查结果，请确认当前代码对应的后端服务已启动。",
      issues: [{ code: "health_missing", message: "GET /api/v1/health 未返回有效数据。" }],
      health
    };
  }

  const issues: BackendContractIssue[] = [];
  const capabilities = Array.isArray(health.capabilities) ? health.capabilities : [];
  const contractVersion = health.contractVersion;
  const minDesktopContractVersion = health.minDesktopContractVersion;

  if (!hasContractNumber(contractVersion)) {
    issues.push({
      code: "contract_version_missing",
      message: "后端缺少 contractVersion，通常表示当前运行的是旧后端进程。"
    });
  } else if (contractVersion < DESKTOP_CONTRACT_VERSION) {
    issues.push({
      code: "backend_contract_too_old",
      message: `后端契约版本为 ${contractVersion}，桌面端需要至少 ${DESKTOP_CONTRACT_VERSION}。`
    });
  }

  if (hasContractNumber(minDesktopContractVersion) && minDesktopContractVersion > DESKTOP_CONTRACT_VERSION) {
    issues.push({
      code: "desktop_contract_too_old",
      message: `后端要求桌面端契约版本至少 ${minDesktopContractVersion}，当前桌面端为 ${DESKTOP_CONTRACT_VERSION}。`
    });
  }

  const missingCapabilities = REQUIRED_BACKEND_CAPABILITIES.filter((capability) => !capabilities.includes(capability));
  if (missingCapabilities.length) {
    issues.push({
      code: "capability_missing",
      message: `后端缺少必要能力：${missingCapabilities.join("、")}。`
    });
  }

  if (issues.length) {
    return {
      compatible: false,
      title: "后端与桌面端版本不一致",
      message: "请重启当前代码对应的后端服务，或重新打包桌面端后再登录。为避免工作区白屏，AgentPro 已暂停进入应用。",
      issues,
      health
    };
  }

  return {
    compatible: true,
    title: "后端版本已匹配",
    message: "桌面端与后端契约版本一致，可以继续进入工作区。",
    issues: [],
    health
  };
}

export function getBackendHealth() {
  return apiGet<HealthPayload>("/health", {
    status: "ok",
    service: "agentpro-api",
    version: "mock",
    contractVersion: DESKTOP_CONTRACT_VERSION,
    minDesktopContractVersion: DESKTOP_CONTRACT_VERSION,
    capabilities: [...REQUIRED_BACKEND_CAPABILITIES]
  });
}
