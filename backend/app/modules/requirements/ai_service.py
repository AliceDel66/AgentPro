import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret
from app.core.net import assert_safe_outbound_url
from app.db.models import ModelProviderConfig
from app.modules.requirements.graph import (
    RequirementGraphState,
    confirmed_decision_keys,
    filter_confirmed_followups,
    run_requirement_graph,
)

SYSTEM_PROMPT = """你是 AgentPro 的需求访谈与 Agent 架构助手。
你的任务是基于用户的真实对话，继续进行智能澄清、归纳需求、识别风险，并产出 AgentSpec 草案。

必须只返回一个 JSON 对象，不要返回 Markdown、代码块或额外解释。JSON schema:
{
  "assistantMessage": "面向用户的下一轮中文回复",
  "summary": "对当前需求的一段简明中文摘要",
  "gaps": ["target_users", "tools", "permissions", "success_metrics"],
  "followupQuestions": [
    {"key": "target_users", "question": "需要用户回答的问题", "reason": "为什么需要确认"}
  ],
  "decisions": [{"key": "scope", "value": "已形成的结论", "confirmed": false}],
  "specDraft": {
    "name": "Agent 名称",
    "objective": "目标",
    "capabilities": ["能力"],
    "openQuestions": [{"key": "target_users", "question": "问题", "reason": "原因"}],
    "decisions": [{"key": "scope", "value": "结论", "confirmed": false}]
  },
  "safetyReview": {"riskLevel": "low|medium|high", "risks": ["风险说明"]}
}

规则:
- 优先用中文回答。
- assistantMessage 和 followupQuestions 必须结合用户给出的真实场景、对象、任务和行业名词。
- 不允许机械套用“目标用户/工具/权限/指标/兜底”模板；每个问题都要写出它与当前场景的关系。
- 不要编造用户没有给出的业务事实；不确定时放入 followupQuestions。
- confirmedDecisions 中 confirmed=true 的 key 视为用户已经回答；
  禁止再次生成同 key 的 followupQuestions，也不要在 assistantMessage 中重复追问同一问题。
- 当需求足够清晰时，followupQuestions 返回空数组，assistantMessage 提示可以生成 AgentSpec 草案。
- 高风险动作包括支付、退款、删除、写入生产数据、发送外部消息、审批绕过等。
- 发现高风险动作时，必须在 safetyReview 中说明。
"""

STREAM_SYSTEM_PROMPT = """你是 AgentPro 的需求访谈与 Agent 架构助手。
请基于当前对话，用中文直接回复用户下一步需要确认的内容。

规则:
- 输出自然的用户可读文本，不要输出 JSON。
- 先简短总结你理解到的需求，再提出最关键的 2-5 个反问或确认项。
- 反问必须结合用户真实业务，不要机械套用模板。
- 不要编造用户没有给出的业务事实；不确定时明确请用户确认。
- confirmedDecisions 中 confirmed=true 的问题视为用户已经回答；
  不要重复追问同一个问题，只能在确实需要时追问更具体的新缺口。
- 如涉及支付、退款、删除、生产数据写入、外部消息发送、
  审批绕过等高风险动作，必须提醒权限和人工审批边界。
- 如果需求已经足够清晰，提示可以生成 AgentSpec 草案。
"""


def build_chat_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized
    return f"{normalized}/chat/completions"


async def load_latest_model_config(
    session: AsyncSession,
    user_id: str,
) -> ModelProviderConfig | None:
    result = await session.execute(
        select(ModelProviderConfig)
        .where(ModelProviderConfig.user_id == user_id)
        .order_by(ModelProviderConfig.updated_at.desc())
    )
    return result.scalars().first()


async def call_openai_chat_completion(
    base_url: str,
    api_key: str | None,
    model: str,
    messages: list[dict[str, str]],
) -> str:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    chat_url = build_chat_url(base_url)
    assert_safe_outbound_url(chat_url)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            chat_url,
            headers=headers,
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.2,
            },
        )
        response.raise_for_status()
        payload = response.json()

    choices = payload.get("choices", []) if isinstance(payload, dict) else []
    if not choices or not isinstance(choices[0], dict):
        raise ValueError("AI response does not contain choices")

    message = choices[0].get("message", {})
    content = message.get("content", "") if isinstance(message, dict) else ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and isinstance(item.get("text"), str)
        ]
        return "\n".join(part for part in parts if part)
    raise ValueError("AI response content is not text")


def extract_stream_delta(payload: dict[str, Any]) -> str:
    choices = payload.get("choices", [])
    if not choices or not isinstance(choices[0], dict):
        return ""

    delta = choices[0].get("delta", {})
    content = delta.get("content", "") if isinstance(delta, dict) else ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and isinstance(item.get("text"), str)
        ]
        return "".join(parts)
    return ""


async def call_openai_chat_completion_stream(
    base_url: str,
    api_key: str | None,
    model: str,
    messages: list[dict[str, str]],
) -> AsyncIterator[str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    chat_url = build_chat_url(base_url)
    assert_safe_outbound_url(chat_url)
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            chat_url,
            headers=headers,
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data:"):
                    continue

                data = line.removeprefix("data:").strip()
                if data == "[DONE]":
                    break
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    token = extract_stream_delta(payload)
                    if token:
                        yield token


def extract_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL | re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()
    elif not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]

    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("AI response JSON is not an object")
    return payload


def string_list(value: Any, limit: int = 12) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return items[:limit]


def normalize_followups(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    followups: list[dict[str, str]] = []
    for index, item in enumerate(value[:8], start=1):
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or item.get("title") or "").strip()
        if not question:
            continue
        key = str(item.get("key") or f"question_{index}").strip()
        reason = str(item.get("reason") or "补齐开发和评审所需约束").strip()
        followups.append({"key": key, "question": question, "reason": reason})
    return followups


def normalize_decisions(
    value: Any,
    confirmed_decisions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    decisions: list[dict[str, Any]] = []
    if isinstance(value, list):
        for index, item in enumerate(value[:12], start=1):
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or f"decision_{index}").strip()
            if not key:
                continue
            decisions.append(
                {
                    "key": key,
                    "value": item.get("value", ""),
                    "confirmed": bool(item.get("confirmed", False)),
                }
            )

    by_key = {str(item.get("key")): item for item in decisions if item.get("key")}
    for item in confirmed_decisions:
        key = str(item.get("key") or "").strip()
        if key:
            by_key[key] = {
                "key": key,
                "value": item.get("value"),
                "confirmed": bool(item.get("confirmed", False)),
            }
    return list(by_key.values())


def normalize_safety_review(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"riskLevel": "low", "risks": []}

    risks = string_list(value.get("risks"), limit=8)
    risk_level = str(value.get("riskLevel") or "").lower()
    if risk_level not in {"low", "medium", "high"}:
        risk_level = "medium" if risks else "low"
    return {"riskLevel": risk_level, "risks": risks}


def normalize_spec_draft(
    value: Any,
    title: str,
    summary: str,
    followups: list[dict[str, str]],
    decisions: list[dict[str, Any]],
) -> dict[str, Any]:
    draft = value if isinstance(value, dict) else {}
    capabilities = string_list(draft.get("capabilities"), limit=12) or [
        "需求访谈",
        "主动反问",
        "AgentSpec 生成",
        "开发前安全约束整理",
    ]
    open_questions = normalize_followups(draft.get("openQuestions")) or followups
    return {
        "name": str(draft.get("name") or f"{title} Agent").strip(),
        "objective": str(draft.get("objective") or summary).strip(),
        "capabilities": capabilities,
        "openQuestions": open_questions,
        "decisions": decisions,
    }


def followup_message_from_remaining(
    raw_followups: list[dict[str, str]],
    followups: list[dict[str, Any]],
    assistant_message: str,
) -> str:
    if len(raw_followups) == len(followups):
        return assistant_message
    if followups:
        lines = ["已记录你的确认。为了让 AgentSpec 更可执行，还需要补充："]
        lines.extend(
            f"{index}. {item['question']}" for index, item in enumerate(followups, start=1)
        )
        return "\n".join(lines)
    return "已记录你的确认，当前需求的关键问题已更新。你可以继续补充细节，或生成 AgentSpec 草案。"


def normalize_ai_payload(
    payload: dict[str, Any],
    title: str,
    messages: list[dict[str, str]],
    confirmed_decisions: list[dict[str, Any]],
    model: str,
) -> RequirementGraphState:
    latest_user_message = next(
        (
            message.get("content", "")
            for message in reversed(messages)
            if message.get("role") == "user"
        ),
        "",
    )
    summary = str(payload.get("summary") or latest_user_message or title).strip()
    decisions = normalize_decisions(payload.get("decisions"), confirmed_decisions)
    raw_followups = normalize_followups(payload.get("followupQuestions"))
    followups = filter_confirmed_followups(raw_followups, decisions)
    gaps = [
        gap
        for gap in string_list(payload.get("gaps"), limit=8)
        if gap not in confirmed_decision_keys(decisions)
    ]
    spec_draft = normalize_spec_draft(
        payload.get("specDraft"),
        title,
        summary,
        followups,
        decisions,
    )
    assistant_message = followup_message_from_remaining(
        raw_followups,
        followups,
        str(payload.get("assistantMessage") or "").strip(),
    )
    return {
        "messages": messages,
        "confirmed_decisions": confirmed_decisions,
        "assistantMessage": assistant_message,
        "summary": summary,
        "gaps": gaps,
        "followupQuestions": followups,
        "decisions": decisions,
        "specDraft": spec_draft,
        "safetyReview": normalize_safety_review(payload.get("safetyReview")),
        "approvalStatus": "waiting_user_confirmation",
        "model": model,
    }


def normalize_plain_text_ai_response(
    content: str,
    messages: list[dict[str, str]],
    confirmed_decisions: list[dict[str, Any]],
    model: str,
) -> RequirementGraphState:
    state = run_requirement_graph(messages, confirmed_decisions=confirmed_decisions)
    state["assistantMessage"] = content.strip()
    state["model"] = model
    state["aiResponseFormat"] = "plain_text"
    return state


async def run_ai_requirement_graph(
    session: AsyncSession,
    user_id: str,
    requirement_title: str,
    messages: list[dict[str, str]],
    confirmed_decisions: list[dict[str, Any]] | None = None,
) -> RequirementGraphState | None:
    config = await load_latest_model_config(session, user_id)
    if not config or not config.base_url or not config.default_model:
        return None

    decisions = confirmed_decisions or []
    user_payload = {
        "requirementTitle": requirement_title,
        "conversation": messages,
        "confirmedDecisions": decisions,
    }
    content = await call_openai_chat_completion(
        config.base_url,
        decrypt_secret(config.api_key_ciphertext),
        config.default_model,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            },
        ],
    )
    try:
        payload = extract_json_object(content)
    except (json.JSONDecodeError, ValueError):
        if content.strip():
            return normalize_plain_text_ai_response(
                content,
                messages,
                decisions,
                config.default_model,
            )
        raise

    return normalize_ai_payload(
        payload,
        requirement_title,
        messages,
        decisions,
        config.default_model,
    )


async def stream_ai_requirement_message(
    session: AsyncSession,
    user_id: str,
    requirement_title: str,
    messages: list[dict[str, str]],
    confirmed_decisions: list[dict[str, Any]] | None = None,
) -> AsyncIterator[str]:
    config = await load_latest_model_config(session, user_id)
    if not config or not config.base_url or not config.default_model:
        return

    user_payload = {
        "requirementTitle": requirement_title,
        "conversation": messages,
        "confirmedDecisions": confirmed_decisions or [],
    }
    async for token in call_openai_chat_completion_stream(
        config.base_url,
        decrypt_secret(config.api_key_ciphertext),
        config.default_model,
        [
            {"role": "system", "content": STREAM_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            },
        ],
    ):
        yield token
