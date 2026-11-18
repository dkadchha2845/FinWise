"""Text-to-Analytics chat: LLM routes the question to a deterministic tool, then narrates the verified result."""
from __future__ import annotations

import json
import re
from typing import AsyncIterator

import pandas as pd

from . import analytics as A
from .categories import CATEGORIES
from .llm import LLMError, llm
from .verify import verify

TOOLS = {
    "spending_summary": ("Totals for a month or all months: income, spent, savings rate and spend per category.",
                         {"month": "YYYY-MM | latest | previous | null(all)"}),
    "category_spend": ("Spend in one category: total, count, average, largest and top merchants.",
                       {"category": f"one of {CATEGORIES}", "month": "YYYY-MM | latest | previous | null"}),
    "top_merchants": ("Merchants where the user spends the most.",
                      {"n": "int", "month": "YYYY-MM | latest | null", "category": "optional category"}),
    "compare_months": ("Compare spending between two months, per category.",
                       {"month_a": "YYYY-MM | previous", "month_b": "YYYY-MM | latest"}),
    "find_transactions": ("Search individual transactions by merchant/keyword, category, amount range, month.",
                          {"query": "text|null", "category": "|null", "min_amount": "number|null",
                           "max_amount": "number|null", "month": "|null", "direction": "debit|credit|null"}),
    "subscriptions": ("Recurring subscriptions and their monthly / annual cost.", {}),
    "upcoming_bills": ("Recurring bills, rent, EMIs expected in the next 30 days.", {}),
    "unusual_expenses": ("Unusual / suspicious / anomalous expenses with reasons.", {}),
    "budget_suggestion": ("Suggested monthly budget (50/30/20 rule) vs current spending.", {}),
    "health_score": ("Financial health score (0-100) and its components.", {}),
    "spending_patterns": ("Habits: weekday vs weekend spending, recurring payments, month-over-month change.", {}),
    "none": ("No data needed (greeting, general concept question).", {}),
}


def run_tool(df: pd.DataFrame, tool: str, args: dict) -> tuple[dict, dict | None]:
    """Execute a tool -> (result, chart spec)."""
    args = {k: v for k, v in (args or {}).items() if v not in (None, "", "null")}
    month = A.resolve_month(df, args.get("month"))
    if tool == "spending_summary":
        r = A.overview(df, month)
        data = [{"name": c["category"], "value": c["amount"]} for c in r["by_category"][:6]]
        rest = sum(c["amount"] for c in r["by_category"][6:])
        if rest:
            data.append({"name": "Everything else", "value": A.r2(rest)})
        return r, {"type": "donut", "title": f"Spending by category · {r['period']}", "data": data}
    if tool == "category_spend":
        cat = next((c for c in CATEGORIES if c.lower() == str(args.get("category", "")).lower()), None) \
              or next((c for c in CATEGORIES if str(args.get("category", "")).lower()[:4] in c.lower()), "Food & Dining")
        r = A.category_detail(df, cat, month)
        return r, {"type": "bar", "title": f"Top merchants · {cat}",
                   "data": [{"name": m["merchant"], "value": m["amount"]} for m in r["top_merchants"]]}
    if tool == "top_merchants":
        r = A.top_merchants(df, int(args.get("n", 5)), month, args.get("category"))
        return {"period": A.month_label(month), "merchants": r}, {
            "type": "bar", "title": "Top merchants", "data": [{"name": m["merchant"], "value": m["amount"]} for m in r]}
    if tool == "compare_months":
        ms = A.months(df)
        a = A.resolve_month(df, args.get("month_a")) or (ms[-2] if len(ms) > 1 else ms[0])
        b = A.resolve_month(df, args.get("month_b")) or ms[-1]
        r = A.compare_months(df, a, b)
        return r, {"type": "bar", "title": "Change by category (₹)",
                   "data": [{"name": c["category"], "value": c["change"]} for c in r["categories"][:7]]}
    if tool == "find_transactions":
        r = A.find_transactions(df, args.get("query"), args.get("category"), args.get("min_amount"),
                                args.get("max_amount"), month, args.get("direction"), int(args.get("limit", 8)))
        return r, None
    if tool == "subscriptions":
        r = A.subscriptions(df)
        return r, {"type": "bar", "title": "Subscriptions (₹/month)",
                   "data": [{"name": s["merchant"], "value": s["monthly_amount"]} for s in r["items"]]}
    if tool == "upcoming_bills":
        return A.upcoming_bills(df), None
    if tool == "unusual_expenses":
        return {"count": int(df["is_anomaly"].sum()), "items": A.anomalies(df)}, None
    if tool == "budget_suggestion":
        r = A.budget_suggestion(df)
        return r, {"type": "bar", "title": "Average vs suggested cap (₹/month)",
                   "data": [{"name": c["category"], "value": c["avg_monthly"], "cap": c["suggested_cap"]}
                            for c in r["categories"][:7]]}
    if tool == "health_score":
        return A.health_score(df), None
    if tool == "spending_patterns":
        return {"weekday_vs_weekend": A.weekday_weekend(df), "recurring": A.recurring(df)[:8],
                "month_over_month": A.mom_change(df)}, None
    return {}, None


def _router_prompt(df: pd.DataFrame) -> str:
    ms = A.months(df)
    tools = "\n".join(f'- {n}: {d} args={json.dumps(p)}' for n, (d, p) in TOOLS.items())
    return (f"You route questions about the user's bank statement to ONE analytics tool.\n"
            f"Statement months: {ms} (latest={ms[-1]}). Today is after the statement ends.\n"
            f"Categories: {CATEGORIES}\nTools:\n{tools}\n"
            'Reply JSON only: {"tool": "<name>", "args": {...}}')


KEYWORDS = [
    (r"breakdown|overview|summary|how much did i (spend|save)|total spen", "spending_summary"),
    (r"subscri|netflix|spotify|ott", "subscriptions"), (r"upcoming|due|bill", "upcoming_bills"),
    (r"unusual|anomal|suspicious|weird|strange|duplicate", "unusual_expenses"),
    (r"budget|plan|50.?30.?20|save more|cut", "budget_suggestion"), (r"health|score", "health_score"),
    (r"compare|vs|versus|change|increase|decrease|more than last", "compare_months"),
    (r"top merchant|where do i spend|most money|biggest", "top_merchants"),
    (r"weekend|weekday|habit|pattern|recurring", "spending_patterns"),
    (r"transaction|show me|find|list|search", "find_transactions"),
]


def mock_route(df: pd.DataFrame, q: str) -> tuple[str, dict]:
    ql = q.lower()
    month = "latest" if re.search(r"this month|current month|latest", ql) else \
        "previous" if "last month" in ql else None
    for c in CATEGORIES:
        if c.lower().split(" ")[0] in ql or (c == "Food & Dining" and re.search(r"food|eat|swiggy|zomato", ql)):
            if not re.search(r"compare|budget", ql):
                return "category_spend", {"category": c, "month": month}
    for rx, tool in KEYWORDS:
        if re.search(rx, ql):
            return tool, {"month": month}
    return "spending_summary", {"month": month}


async def route(df: pd.DataFrame, q: str, history: list[dict]) -> tuple[str, dict]:
    if not llm.available:
        return mock_route(df, q)
    msgs = [{"role": "system", "content": _router_prompt(df)}]
    for h in history[-4:]:
        msgs.append({"role": h["role"], "content": h["content"][:400]})
    msgs.append({"role": "user", "content": q})
    try:
        out = await llm.complete_json(msgs, temperature=0.0, max_tokens=200)
        tool = out.get("tool")
        if tool in TOOLS:
            return tool, out.get("args") or {}
    except (LLMError, json.JSONDecodeError):
        pass
    return mock_route(df, q)


ANSWER_SYSTEM = ("You are FinWise, a friendly AI that explains an Indian user's finances in plain language. "
                 "Answer the question using ONLY numbers present in TOOL_RESULT; copy them exactly (₹ with Indian "
                 "digit grouping), rounded to the nearest rupee. Never add up, subtract or derive new numbers yourself. If the result does not "
                 "contain what is needed, say so. Keep it under 130 words; use short bullet points for lists; "
                 "finish with one practical tip. No investment advice.")


def _answer_msgs(q: str, tool: str, result: dict, history: list[dict]) -> list[dict]:
    msgs = [{"role": "system", "content": ANSWER_SYSTEM}]
    for h in history[-4:]:
        msgs.append({"role": h["role"], "content": h["content"][:600]})
    msgs.append({"role": "user", "content": f"QUESTION: {q}\nTOOL: {tool}\nTOOL_RESULT: {json.dumps(result, default=str)}"})
    return msgs


_inr = A.inr


def mock_answer(tool: str, r: dict) -> str:
    if tool == "spending_summary":
        lines = [f"In {r['period']} you received {_inr(r['income'])} and spent {_inr(r['spent'])} "
                 f"(savings rate {r['savings_rate_pct']}%). Top categories:"]
        lines += [f"- **{c['category']}**: {_inr(c['amount'])} ({c['share_pct']}%)" for c in r["by_category"][:5]]
        return "\n".join(lines) + "\n\nTip: pick the largest discretionary category and set a monthly cap."
    if tool == "category_spend":
        tops = ", ".join(f"{m['merchant']} ({_inr(m['amount'])})" for m in r["top_merchants"][:3])
        return (f"You spent {_inr(r['total'])} on **{r['category']}** in {r['period']} across {r['count']} transactions "
                f"(average {_inr(r['average'])}, largest {_inr(r['largest'])}). Top merchants: {tops}.")
    if tool == "top_merchants":
        return "Your top merchants:\n" + "\n".join(f"- **{m['merchant']}** ({m['category']}): {_inr(m['amount'])} in "
                                                     f"{m['count']} payments" for m in r["merchants"])
    if tool == "compare_months":
        lines = [f"Spending went from {_inr(r['spent_from'])} in {r['from_month']} to {_inr(r['spent_to'])} in "
                 f"{r['to_month']} ({_inr(r['total_change'])}). Biggest changes:"]
        lines += [f"- **{c['category']}**: {_inr(c['from'])} → {_inr(c['to'])}" for c in r["categories"][:4]]
        return "\n".join(lines)
    if tool == "find_transactions":
        lines = [f"Found {r['matches']} matching transactions totalling {_inr(r['total'])}:"]
        lines += [f"- {t['date']} · {t['merchant']} · {_inr(t['amount'])}" for t in r["transactions"]]
        return "\n".join(lines)
    if tool == "subscriptions":
        lines = [f"You have {r['count']} subscriptions costing {_inr(r['monthly_total'])}/month "
                 f"({_inr(r['annual_total'])}/year):"]
        lines += [f"- **{s['merchant']}**: {_inr(s['monthly_amount'])}/month" for s in r["items"]]
        return "\n".join(lines) + "\n\nTip: cancel any you haven't used in the last month."
    if tool == "upcoming_bills":
        lines = [f"Expected in the next {r['window_days']} days after {r['as_of']} (about {_inr(r['total_due'])}):"]
        lines += [f"- {b['next_expected']} · **{b['merchant']}** · {_inr(b['monthly_amount'])}" for b in r["bills"]]
        return "\n".join(lines)
    if tool == "unusual_expenses":
        lines = [f"I flagged {r['count']} unusual expenses:"]
        lines += [f"- **{a['merchant']}** {_inr(a['amount'])} on {a['date']}: {a['reason']}" for a in r["items"]]
        return "\n".join(lines)
    if tool == "budget_suggestion":
        lines = [f"Based on the 50/30/20 rule and your average income of {_inr(r['avg_monthly_income'])}/month: needs "
                 f"{_inr(r['needs_budget'])}, wants {_inr(r['wants_budget'])}, savings {_inr(r['savings_target'])}."]
        lines += [f"- **{c['category']}**: now {_inr(c['avg_monthly'])} → cap {_inr(c['suggested_cap'])}"
                  for c in r["categories"] if c["cut"] > 0][:5]
        return "\n".join(lines)
    if tool == "health_score":
        return f"Your financial health score is **{r['score']}/100 ({r['label']})**.\n" + "\n".join(
            f"- {c['name']}: {c['points']}/{c['max']} ({c['value']})" for c in r["components"])
    if tool == "spending_patterns":
        w = r["weekday_vs_weekend"]
        return (f"You spend {_inr(w['weekend_avg_per_day'])}/day on weekends vs {_inr(w['weekday_avg_per_day'])}/day on "
                f"weekdays. Recurring payments: " + ", ".join(x["merchant"] for x in r["recurring"][:6]) + ".")
    return ("Hi! I'm FinWise. Ask me about your spending, subscriptions, unusual expenses, upcoming bills or a budget "
            "plan. (Running in offline mode: add a Groq or Gemini key for conversational answers.)")


async def answer_stream(df: pd.DataFrame, q: str, history: list[dict]) -> AsyncIterator[dict]:
    tool, args = await route(df, q, history)
    result, chart = run_tool(df, tool, args)
    yield {"type": "tool", "tool": tool, "args": args, "chart": chart}
    text = ""
    if llm.available:
        try:
            async for tok in llm.stream(_answer_msgs(q, tool, result, history)):
                text += tok
                yield {"type": "token", "text": tok}
        except LLMError as e:
            if not text:
                text = mock_answer(tool, result) + f"\n\n_(LLM unavailable: {str(e)[:80]})_"
                yield {"type": "token", "text": text}
    else:
        text = mock_answer(tool, result)
        yield {"type": "token", "text": text}
    rep = verify(text, {"result": result, "args": args, "question": q})
    yield {"type": "done", "verification": rep.as_dict()}


async def answer(df: pd.DataFrame, q: str, variant: str = "tool", verify_retry: bool = True,
                 use_cache: bool = True) -> dict:
    """Non-streaming answer used by evaluation.
    variant='stuffing': whole (masked) statement in context, no tools.  variant='tool': Text-to-Analytics."""
    if variant == "stuffing":
        rows = df[["date", "masked", "merchant", "category", "amount", "direction"]].copy()
        rows["date"] = rows["date"].dt.strftime("%Y-%m-%d")
        ctx = rows.to_csv(index=False)
        msgs = [{"role": "system", "content": "You are a financial assistant. Answer using the bank statement CSV "
                                              "provided. Use ₹. Keep it under 130 words."},
                {"role": "user", "content": f"STATEMENT:\n{ctx}\n\nQUESTION: {q}"}]
        text = await llm.complete(msgs, temperature=0.2, max_tokens=700, use_cache=use_cache)
        return {"text": text, "tool": None, "result": None}
    tool, args = await route(df, q, [])
    result, _ = run_tool(df, tool, args)
    msgs = _answer_msgs(q, tool, result, [])
    text = await llm.complete(msgs, temperature=0.3, max_tokens=700, use_cache=use_cache)
    grounding = {"result": result, "args": args, "question": q}
    rep = verify(text, grounding)
    attempts = 1
    if verify_retry and rep.gfs < 1.0:
        msgs += [{"role": "assistant", "content": text},
                 {"role": "user", "content": "These numbers are not in TOOL_RESULT: " + ", ".join(rep.unsupported) +
                  ". Rewrite the answer using only numbers copied exactly from TOOL_RESULT."}]
        text = await llm.complete(msgs, temperature=0.1, max_tokens=700, use_cache=use_cache)
        rep = verify(text, grounding)
        attempts = 2
    return {"text": text, "tool": tool, "args": args, "result": grounding, "verification": rep.as_dict(),
            "attempts": attempts}
