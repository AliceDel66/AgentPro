import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppButton } from "../../components/common/Button";
import { LoadingState } from "../../components/common/LoadingState";
import { StatusChip } from "../../components/common/StatusChip";
import { approveAgentSpec, archiveRequirement, generateAgentSpec } from "../../services/agentSpecService";
import type { AgentSpecDraft } from "../../services/types";
import type { Navigate } from "../../types";

interface SpecPageProps {
  activeRequirementId: string | null;
  navigate: Navigate;
  setActiveSpecId: (specId: string | null) => void;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  if (typeof value === "string" && value) return [value];
  return [];
}

function getRiskList(body: Record<string, unknown>) {
  const safetyReview = body.safetyReview;
  if (safetyReview && typeof safetyReview === "object" && "risks" in safetyReview) {
    return asList((safetyReview as { risks?: unknown }).risks);
  }
  return [];
}

export function SpecPage({ activeRequirementId, navigate, setActiveSpecId }: SpecPageProps) {
  const [spec, setSpec] = useState<AgentSpecDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"approve" | "archive" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const saving = action !== null;

  useEffect(() => {
    let cancelled = false;
    if (!activeRequirementId) {
      setSpec(null);
      setErrorMessage("请先创建或选择一个需求");
      return undefined;
    }
    const requirementId = activeRequirementId;

    async function loadSpec() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await generateAgentSpec(requirementId);
        if (!cancelled) {
          setSpec(result.data);
          setActiveSpecId(result.data.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成 AgentSpec 失败";
        if (!cancelled) setErrorMessage(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSpec();
    return () => {
      cancelled = true;
    };
  }, [activeRequirementId, setActiveSpecId]);

  const body = spec?.body ?? {};
  const openQuestions = asList(body.openQuestions);
  const capabilities = asList(body.capabilities);
  const decisions = asList(body.decisions);
  const approvalChecklist = asList(body.approvalChecklist);
  const risks = getRiskList(body);

  const handleApprove = async () => {
    if (!activeRequirementId || saving) return;
    setAction("approve");
    setErrorMessage(null);
    try {
      const result = await approveAgentSpec(activeRequirementId);
      if (result.data.spec?.id) setActiveSpecId(result.data.spec.id);
      navigate("dispatch");
    } catch (error) {
      const message = error instanceof Error ? error.message : "审批 AgentSpec 失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  const handleArchive = async () => {
    if (!activeRequirementId || saving) return;
    setAction("archive");
    setErrorMessage(null);
    try {
      await archiveRequirement(activeRequirementId);
      navigate("library");
    } catch (error) {
      const message = error instanceof Error ? error.message : "归档失败";
      setErrorMessage(message);
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="min-w-0 flex-1 overflow-y-auto bg-agent-bg px-9 py-8 pb-24">
        <div className="mx-auto max-w-[800px]">
          <div className="mb-6 flex items-center gap-3">
            <h1 className="m-0 text-[22px] font-bold text-agent-ink">{spec?.title ?? "AgentSpec 草案"}</h1>
            <StatusChip tone={spec?.status === "approved" ? "green" : "blue"}>{spec?.status === "approved" ? "已审批" : "待审批"}</StatusChip>
          </div>
          <div className="-mt-4 mb-7 text-[13px] text-agent-muted">
            {loading ? <LoadingState label="正在生成 AgentSpec..." /> : spec ? `AgentSpec v${spec.version}` : "未生成 AgentSpec"}
          </div>

          {errorMessage ? <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-agent-danger">{errorMessage}</div> : null}

          <div className="overflow-hidden rounded-xl border border-agent-border bg-white">
            <SpecSection index="1" title="业务目标">
              {String(body.objective ?? "暂无业务目标。")}
            </SpecSection>

            <SpecSection index="2" title="能力范围">
              <BulletList items={capabilities} empty="暂无能力范围。" />
            </SpecSection>

            <SpecSection index="3" title="已确认决策">
              <BulletList items={decisions} empty="暂无确认决策。" />
            </SpecSection>

            <SpecSection index="4" title="验收清单">
              <BulletList items={approvalChecklist} empty="暂无验收清单。" />
            </SpecSection>

            <SpecSection danger index="5" title="安全边界">
              <BulletList items={risks} empty="暂无高风险提醒。" />
            </SpecSection>

            <div className="bg-[#FFF7ED] px-7 py-[22px]">
              <div className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-agent-warning">
                <AlertTriangle size={20} />
                未确认假设
              </div>
              <div className="pl-9 text-[13px] leading-8 text-agent-secondary">
                <BulletList items={openQuestions} empty="暂无未确认问题。" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="flex w-60 shrink-0 flex-col gap-3 border-l border-agent-divider bg-white px-[18px] py-6">
        <AppButton disabled={!spec || saving} loading={action === "approve"} type="button" onClick={() => void handleApprove()}>
          {action === "approve" ? "处理中..." : "确认并立即开发"}
        </AppButton>
        <AppButton disabled={!activeRequirementId || saving} loading={action === "archive"} type="button" variant="secondary" onClick={() => void handleArchive()}>
          {action === "archive" ? "存档中..." : "暂时存档"}
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={() => navigate("followup")}>
          继续澄清
        </AppButton>

        <div className="mt-4 rounded-[10px] bg-agent-bg p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-agent-ink">
            <CheckCircle2 size={16} className="text-agent-success" />
            草案完整度
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-agent-divider">
            <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-agent-primary to-agent-cyan" />
          </div>
          <div className="text-xs leading-6 text-agent-muted">AgentSpec 来自后端需求图谱，可继续澄清后重新生成。</div>
        </div>

        <div className="mt-auto text-xs leading-8 text-agent-muted">
          版本：v{spec?.version ?? "-"}
          <br />
          状态：{spec?.status ?? "-"}
          <br />
          能力项：{capabilities.length}
          <br />
          待确认：{openQuestions.length}
        </div>
      </aside>
    </div>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <div>{empty}</div>;
  return (
    <div className="grid gap-1">
      {items.map((item) => (
        <div key={item}>• {item}</div>
      ))}
    </div>
  );
}

function SpecSection({ index, title, children, danger = false }: { index: string; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div className="border-b border-agent-divider px-7 py-[22px]">
      <div className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-agent-ink">
        <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-xs font-bold ${danger ? "bg-[#FEF2F2] text-agent-danger" : "bg-agent-pale text-agent-primary"}`}>
          {index}
        </span>
        {title}
      </div>
      <div className="pl-9 text-[13px] leading-8 text-agent-secondary">{children}</div>
    </div>
  );
}
