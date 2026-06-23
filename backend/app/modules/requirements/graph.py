from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class RequirementGraphState(TypedDict, total=False):
    messages: list[dict[str, str]]
    confirmed_decisions: list[dict[str, Any]]
    assistantMessage: str
    summary: str
    gaps: list[str]
    followupQuestions: list[dict[str, Any]]
    decisions: list[dict[str, Any]]
    specDraft: dict[str, Any]
    safetyReview: dict[str, Any]
    approvalStatus: str
    deliveryTarget: dict[str, Any]


SCENARIO_KEYWORDS = {
    "resume_screening": ["简历", "招聘", "人事", "hr", "候选人", "岗位", "面试"],
    "after_sales": ["售后", "退换货", "退款", "物流", "客服", "订单"],
    "dev_assistant": ["开发", "代码", "需求", "prd", "测试", "部署"],
}

SCENARIO_LABELS = {
    "resume_screening": "人事简历筛选",
    "after_sales": "电商售后客服",
    "dev_assistant": "研发交付",
    "generic": "这个业务场景",
}

SCENARIO_QUESTIONS = {
    "resume_screening": {
        "target_users": (
            "这个简历筛选 Agent 主要给 HR、招聘负责人还是用人部门使用？"
            "不同角色看到的候选人信息和操作权限是否不同？"
        ),
        "tools": (
            "简历数据会来自哪里，例如 PDF/Word 上传、招聘网站、ATS 系统、邮箱或表格？"
            "还需要读取岗位 JD、面试记录或候选人沟通记录吗？"
        ),
        "permissions": (
            "Agent 是否可以自动淘汰、推进或标记候选人，"
            "还是只输出评分、匹配理由和风险提醒后由 HR 复核？"
        ),
        "success_metrics": (
            "你希望用哪些指标衡量筛选效果，例如筛选耗时、合格候选人命中率、"
            "误淘汰率、HR 采纳率或面试通过率？"
        ),
        "fallback": (
            "当简历信息不足、岗位要求冲突、候选人经历存在疑点或涉及敏感信息时，"
            "Agent 应该如何提示 HR 复核？"
        ),
        "data_sources": (
            "岗位 JD、筛选规则、历史录用样本、人才画像、回避规则或合规要求"
            "会存放在哪里，是否需要实时同步？"
        ),
    },
    "after_sales": {
        "target_users": (
            "这个售后 Agent 主要服务一线客服、客服主管还是直接面向消费者？"
            "不同角色需要看到哪些订单和售后信息？"
        ),
        "tools": (
            "它需要连接哪些系统，例如订单系统、物流平台、工单系统、知识库或退款接口？"
            "每个系统只读还是可写？"
        ),
        "permissions": (
            "退货、退款、补发、改地址、关闭工单等动作中，"
            "哪些可以自动执行，哪些必须由人工审批？"
        ),
        "success_metrics": (
            "你希望用哪些指标判断售后 Agent 成功，例如首次响应时间、问题解决率、"
            "退款误操作率、客服采纳率或用户满意度？"
        ),
        "fallback": (
            "当订单异常、物流状态冲突、用户情绪强烈或退款规则不明确时，"
            "Agent 应该如何转人工或升级主管？"
        ),
        "data_sources": (
            "售后规则、物流状态、订单详情、商品政策、客服话术和历史工单数据"
            "分别来自哪里？"
        ),
    },
    "dev_assistant": {
        "target_users": (
            "这个开发 Agent 主要给产品、研发、测试还是项目负责人使用？"
            "他们分别希望它承担哪些环节？"
        ),
        "tools": (
            "它需要连接哪些开发工具，例如 Git 仓库、Issue 系统、CI/CD、"
            "测试报告、日志平台或文档库？"
        ),
        "permissions": (
            "创建分支、提交代码、触发部署、修改配置或关闭任务等动作中，"
            "哪些必须人工确认？"
        ),
        "success_metrics": (
            "你希望用哪些指标评估开发 Agent，例如需求拆解准确率、测试通过率、"
            "交付耗时、返工率或评审通过率？"
        ),
        "fallback": (
            "当需求描述不完整、测试失败、代码冲突或部署风险较高时，"
            "Agent 应该如何暂停并请求人工介入？"
        ),
        "data_sources": "PRD、设计稿、代码规范、历史任务、接口文档和测试用例会从哪里读取？",
    },
}

GENERIC_QUESTION_TEMPLATES = {
    "target_users": (
        "围绕「{subject}」，这个 Agent 的主要使用者是谁？"
        "他们在真实流程里最常遇到的任务和痛点是什么？"
    ),
    "tools": (
        "为了完成「{subject}」，Agent 需要连接哪些系统、文件、数据库、网页或内部 API？"
        "每个数据源是否可读可写？"
    ),
    "permissions": (
        "在「{subject}」流程中，哪些动作只允许 Agent 给建议，"
        "哪些动作可以自动执行，哪些必须人工审批？"
    ),
    "success_metrics": (
        "你希望用哪些指标判断「{subject}」做得好，"
        "例如效率、准确率、成本、采纳率或满意度？"
    ),
    "fallback": "当 Agent 对「{subject}」不确定、信息不足或判断冲突时，应该如何解释原因并转人工？",
    "data_sources": "支撑「{subject}」判断的业务资料、历史数据、规则文档或实时数据分别在哪里？",
    "delivery_target": (
        "做好的「{subject}」Agent 你打算怎么用？"
        "是在 AgentPro 内直接使用、接入飞书/企业微信等外部平台，还是作为独立后台运行？"
    ),
}

GENERIC_OPTIONS = {
    "target_users": ["个人自己使用", "团队成员使用", "多个角色都使用", "不适用"],
    "tools": ["代码仓库/提交记录", "任务系统/文档", "聊天记录/日报周报", "不适用"],
    "permissions": ["只分析和建议", "允许创建草稿", "允许执行低风险动作", "不适用"],
    "success_metrics": ["节省时间", "提高准确率", "提升采纳率", "不适用"],
    "fallback": ["暂停并询问我", "给出风险说明", "转人工复核", "不适用"],
    "data_sources": ["用户手动上传", "读取内部系统", "使用本地文件夹", "不适用"],
    "delivery_target": ["在 AgentPro 内使用", "接入外部平台", "独立后台运行", "不适用"],
}

# Keywords that hint at the delivery/usage form so the rules path can pre-fill deliveryTarget.
DELIVERY_KEYWORDS = {
    "external": [
        "飞书", "企业微信", "钉钉", "slack", "telegram", "openclaw",
        "接入", "集成", "机器人", "webhook",
    ],
    "standalone": ["后台", "独立运行", "定时", "守护", "常驻", "cron", "服务器跑"],
    "in_app": ["软件内", "应用内", "在软件里", "app内", "内部使用", "本地使用"],
}


def detect_delivery_mode(text: str) -> str:
    normalized = text.lower()
    for mode, keywords in DELIVERY_KEYWORDS.items():
        if any(keyword.lower() in normalized for keyword in keywords):
            return mode
    return "undecided"


def build_delivery_target(text: str) -> dict[str, Any]:
    return {"mode": detect_delivery_mode(text), "connectors": [], "note": ""}


def latest_user_text(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return message.get("content", "")
    return ""


def conversation_text(messages: list[dict[str, str]]) -> str:
    return " ".join(message.get("content", "") for message in messages)


def detect_scenario(text: str) -> str:
    normalized = text.lower()
    for scenario, keywords in SCENARIO_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            return scenario
    return "generic"


def scenario_subject(text: str) -> str:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return "这个业务场景"
    if len(cleaned) <= 36:
        return cleaned
    return f"{cleaned[:36]}..."


def build_gap_question(key: str, scenario: str, subject: str) -> dict[str, Any]:
    scenario_questions = SCENARIO_QUESTIONS.get(scenario, {})
    question = scenario_questions.get(key)
    if not question:
        question = GENERIC_QUESTION_TEMPLATES[key].format(subject=subject)
    return {
        "key": key,
        "question": question,
        "reason": "补齐真实业务场景、权限边界和验收标准",
        "options": GENERIC_OPTIONS.get(key, ["确认", "不适用"]),
    }


def confirmed_decision_keys(decisions: list[dict[str, Any]] | None) -> set[str]:
    keys: set[str] = set()
    for item in decisions or []:
        key = str(item.get("key") or "").strip()
        if key and item.get("confirmed"):
            keys.add(key)
    return keys


def filter_confirmed_followups(
    followups: list[dict[str, Any]],
    decisions: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    confirmed_keys = confirmed_decision_keys(decisions)
    if not confirmed_keys:
        return followups
    return [item for item in followups if str(item.get("key") or "").strip() not in confirmed_keys]


def intake_summary(state: RequirementGraphState) -> RequirementGraphState:
    user_text = latest_user_text(state.get("messages", []))
    summary = user_text.strip()[:240] or "用户尚未提供明确需求。"
    return {**state, "summary": summary}


def gap_analysis(state: RequirementGraphState) -> RequirementGraphState:
    corpus = conversation_text(state.get("messages", [])).lower()
    gap_rules = {
        "target_users": ["用户", "客户", "员工", "角色", "新手", "hr", "招聘", "客服"],
        "tools": ["api", "系统", "数据库", "工具", "浏览器", "mcp", "ats", "邮箱"],
        "permissions": ["审批", "权限", "退款", "删除", "写入", "执行", "淘汰", "推进"],
        "success_metrics": ["指标", "成功", "准确率", "响应", "成本", "满意度", "命中率"],
        "fallback": ["转人工", "降级", "失败", "兜底", "不确定", "复核", "升级"],
        "data_sources": ["知识库", "文档", "数据源", "资料", "订单", "日志", "简历", "jd"],
        "delivery_target": [
            "飞书", "企业微信", "钉钉", "slack", "openclaw", "接入", "集成",
            "后台", "独立", "软件内", "应用内", "机器人", "webhook",
        ],
    }
    gaps = [
        key for key, keywords in gap_rules.items() if not any(word in corpus for word in keywords)
    ]
    confirmed_keys = confirmed_decision_keys(state.get("confirmed_decisions", []))
    gaps = [key for key in gaps if key not in confirmed_keys]
    return {**state, "gaps": gaps}


def followup_questions(state: RequirementGraphState) -> RequirementGraphState:
    text = conversation_text(state.get("messages", []))
    scenario = detect_scenario(text)
    subject = scenario_subject(latest_user_text(state.get("messages", [])) or text)
    questions = [
        build_gap_question(key, scenario, subject)
        for key in state.get("gaps", [])
    ]
    questions = filter_confirmed_followups(questions, state.get("confirmed_decisions", []))
    label = SCENARIO_LABELS.get(scenario, SCENARIO_LABELS["generic"])
    if questions:
        assistant_message = "\n".join(
            [
                (
                    f"我先按「{label}」这个实际场景来拆。"
                    "为了让后续 AgentSpec 能落到可执行流程，我需要确认："
                ),
                *[
                    f"{index}. {item['question']}"
                    for index, item in enumerate(questions[:5], start=1)
                ],
            ]
        )
    else:
        assistant_message = f"围绕「{label}」的关键信息已经比较完整，可以生成 AgentSpec 草案。"
    return {**state, "followupQuestions": questions[:5], "assistantMessage": assistant_message}


def decision_merge(state: RequirementGraphState) -> RequirementGraphState:
    decisions = state.get("confirmed_decisions", [])
    if not decisions:
        decisions = [
            {"key": "scope", "value": state.get("summary", ""), "confirmed": False},
            {"key": "human_review", "value": "高风险动作需要人工审批", "confirmed": False},
        ]
    return {**state, "decisions": decisions}


def spec_draft(state: RequirementGraphState) -> RequirementGraphState:
    text = conversation_text(state.get("messages", []))
    scenario = detect_scenario(text)
    label = SCENARIO_LABELS.get(scenario, SCENARIO_LABELS["generic"])
    delivery_target = state.get("deliveryTarget") or build_delivery_target(text)
    draft = {
        "name": f"{label} Agent",
        "objective": state.get("summary", ""),
        "capabilities": ["需求访谈", "主动反问", "AgentSpec 生成", "开发前安全约束整理"],
        "openQuestions": state.get("followupQuestions", []),
        "decisions": state.get("decisions", []),
        "deliveryTarget": delivery_target,
    }
    return {**state, "specDraft": draft, "deliveryTarget": delivery_target}


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
