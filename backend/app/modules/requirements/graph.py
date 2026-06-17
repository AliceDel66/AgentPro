from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class RequirementGraphState(TypedDict, total=False):
    messages: list[dict[str, str]]
    confirmed_decisions: list[dict[str, Any]]
    summary: str
    gaps: list[str]
    followupQuestions: list[dict[str, str]]
    decisions: list[dict[str, Any]]
    specDraft: dict[str, Any]
    safetyReview: dict[str, Any]
    approvalStatus: str


GAP_QUESTIONS = {
    "target_users": "这个 Agent 主要服务哪些用户角色？他们的技术水平和使用频率如何？",
    "tools": "Agent 是否需要调用外部系统、数据库、浏览器或内部 API？",
    "permissions": "Agent 可以执行哪些高风险操作？哪些操作必须由人工审批？",
    "success_metrics": "你希望用哪些指标判断 Agent 是否开发成功？",
    "fallback": "当 Agent 不确定或无法处理时，应该如何转人工或降级？",
    "data_sources": "Agent 需要使用哪些知识库、业务文档或实时数据源？",
}


def latest_user_text(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return message.get("content", "")
    return ""


def intake_summary(state: RequirementGraphState) -> RequirementGraphState:
    user_text = latest_user_text(state.get("messages", []))
    summary = user_text.strip()[:240] or "用户尚未提供明确需求。"
    return {**state, "summary": summary}


def gap_analysis(state: RequirementGraphState) -> RequirementGraphState:
    corpus = " ".join(message.get("content", "") for message in state.get("messages", [])).lower()
    gap_rules = {
        "target_users": ["用户", "客户", "员工", "角色", "新手"],
        "tools": ["api", "系统", "数据库", "工具", "浏览器", "mcp"],
        "permissions": ["审批", "权限", "退款", "删除", "写入", "执行"],
        "success_metrics": ["指标", "成功", "准确率", "响应", "成本", "满意度"],
        "fallback": ["转人工", "降级", "失败", "兜底", "不确定"],
        "data_sources": ["知识库", "文档", "数据源", "资料", "订单", "日志"],
    }
    gaps = [
        key for key, keywords in gap_rules.items() if not any(word in corpus for word in keywords)
    ]
    return {**state, "gaps": gaps}


def followup_questions(state: RequirementGraphState) -> RequirementGraphState:
    questions = [
        {"key": key, "question": GAP_QUESTIONS[key], "reason": "补齐开发和评审所需约束"}
        for key in state.get("gaps", [])
    ]
    return {**state, "followupQuestions": questions[:5]}


def decision_merge(state: RequirementGraphState) -> RequirementGraphState:
    decisions = state.get("confirmed_decisions", [])
    if not decisions:
        decisions = [
            {"key": "scope", "value": state.get("summary", ""), "confirmed": False},
            {"key": "human_review", "value": "高风险动作需要人工审批", "confirmed": False},
        ]
    return {**state, "decisions": decisions}


def spec_draft(state: RequirementGraphState) -> RequirementGraphState:
    draft = {
        "name": "AgentPro 需求草案",
        "objective": state.get("summary", ""),
        "capabilities": ["需求访谈", "主动反问", "AgentSpec 生成", "开发前安全约束整理"],
        "openQuestions": state.get("followupQuestions", []),
        "decisions": state.get("decisions", []),
    }
    return {**state, "specDraft": draft}


def safety_review(state: RequirementGraphState) -> RequirementGraphState:
    risks = []
    text = state.get("summary", "")
    if any(word in text for word in ["退款", "删除", "支付", "财务", "审批"]):
        risks.append("包含高风险业务动作，需要权限边界和人工审批策略。")
    if state.get("gaps"):
        risks.append("需求仍存在未确认项，立即开发前需要用户确认。")
    return {
        **state,
        "safetyReview": {
            "riskLevel": "medium" if risks else "low",
            "risks": risks,
        },
    }


def approval_wait(state: RequirementGraphState) -> RequirementGraphState:
    return {**state, "approvalStatus": "waiting_user_confirmation"}


def build_requirement_graph():
    graph = StateGraph(RequirementGraphState)
    graph.add_node("intake_summary", intake_summary)
    graph.add_node("gap_analysis", gap_analysis)
    graph.add_node("followup_questions", followup_questions)
    graph.add_node("decision_merge", decision_merge)
    graph.add_node("spec_draft", spec_draft)
    graph.add_node("safety_review", safety_review)
    graph.add_node("approval_wait", approval_wait)

    graph.set_entry_point("intake_summary")
    graph.add_edge("intake_summary", "gap_analysis")
    graph.add_edge("gap_analysis", "followup_questions")
    graph.add_edge("followup_questions", "decision_merge")
    graph.add_edge("decision_merge", "spec_draft")
    graph.add_edge("spec_draft", "safety_review")
    graph.add_edge("safety_review", "approval_wait")
    graph.add_edge("approval_wait", END)
    return graph.compile()


requirement_graph = build_requirement_graph()


def run_requirement_graph(
    messages: list[dict[str, str]],
    confirmed_decisions: list[dict[str, Any]] | None = None,
) -> RequirementGraphState:
    return requirement_graph.invoke(
        {
            "messages": messages,
            "confirmed_decisions": confirmed_decisions or [],
        }
    )
