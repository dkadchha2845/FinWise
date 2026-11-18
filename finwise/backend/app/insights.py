"""Grounded Explain-then-Verify narration: LLM narrates computed facts, verifier checks every number."""
from __future__ import annotations

import json

import pandas as pd

from . import analytics as A
from . import db
from .llm import LLMError, llm
from .verify import verify

STYLE = ("Write for an Indian user. Use ₹ with Indian digit grouping (e.g. ₹1,25,000). "
         "Use ONLY numbers that appear in FACTS — never compute new totals, differences or percentages. "
         "No investment advice. Be specific, warm and concise.")


async def grounded_json(system: str, facts, instruction: str, text_of, retries: int = 1, use_cache: bool = True):
    """Ask for JSON grounded in facts; verify all numbers; on failure regenerate once with feedback.
    Returns (data, report, attempts)."""
    msgs = [{"role": "system", "content": f"{system}\n{STYLE}"},
            {"role": "user", "content": f"FACTS:\n{json.dumps(facts, default=str)}\n\nTASK:\n{instruction}"}]
    data, rep = None, None
    for attempt in range(retries + 1):
        data = await llm.complete_json(msgs, temperature=0.3 if attempt == 0 else 0.1, use_cache=use_cache)
        rep = verify(text_of(data), facts)
        if rep.gfs == 1.0:
            return data, rep, attempt + 1
        msgs += [{"role": "assistant", "content": json.dumps(data)},
                 {"role": "user", "content": "These numbers are NOT in FACTS: " + ", ".join(rep.unsupported) +
                  ". Rewrite the JSON using only numbers copied exactly from FACTS (or remove them)."}]
    return data, rep, retries + 1


# ------------------------------------------------------------------ anomaly explanations
def _template_explanation(a: dict) -> tuple[str, str]:
    t = a["type"]
    if t == "duplicate":
        return (f"{a['reason']}. Two identical charges this close together usually mean a double debit or a retried "
                f"payment.", f"Check with {a['merchant']} or your bank and ask for a refund of the duplicate {A.inr(a['amount'])}.")
    if t == "new_merchant":
        return (f"{a['reason']}. A large first-time payment is worth a second look.",
                "Confirm you recognise this payment. If it was planned (travel, a gadget), treat it as a one-off and "
                "set aside money for such purchases next time.")
    return (f"{a['reason']}. This is far outside your normal pattern for {a['category']}.",
            f"If it was a one-off, no action needed; otherwise set a monthly cap for {a['category']}.")


async def explain_anomalies(df: pd.DataFrame) -> list[dict]:
    anoms = A.anomalies(df)
    todo = [a for a in anoms if not a.get("explanation")]
    if not todo:
        return anoms
    results: dict[int, tuple[str, str]] = {}
    if llm.available:
        ov = A.overview(df)
        cat_avg = {c["category"]: round(c["amount"] / max(1, len(A.months(df))), 2) for c in ov["by_category"]}
        facts = {"unusual_expenses": [{**{k: a[k] for k in ("id", "date", "merchant", "category", "amount", "type", "reason")},
                                       "category_avg_monthly": cat_avg.get(a["category"])} for a in todo],
                 "avg_monthly_spend": ov["avg_monthly_spend"]}
        instr = ('For each unusual expense write "explanation" (1-2 sentences: why it stands out, plausible cause) and '
                 '"suggestion" (one concrete action). Reply JSON {"items":[{"id":<id>,"explanation":"...","suggestion":"..."}]}')
        try:
            data, rep, _ = await grounded_json("You are FinWise, a personal-finance explainer.", facts, instr,
                                               lambda d: json.dumps(d.get("items", []), ensure_ascii=False))
            for it in data.get("items", []):
                if isinstance(it, dict) and "id" in it:
                    v = verify(it.get("explanation", "") + " " + it.get("suggestion", ""), facts)
                    if v.gfs == 1.0:
                        results[int(it["id"])] = (it.get("explanation", ""), it.get("suggestion", ""))
        except (LLMError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            pass
    updates = []
    for a in todo:
        exp, sug = results.get(a["id"]) or _template_explanation(a)
        a["explanation"], a["suggestion"] = exp, sug
        updates.append((exp, sug, a["id"]))
    db.update_explanations(updates)
    return anoms


# ------------------------------------------------------------------ insight cards
def _template_insights(f: dict) -> dict:
    t, out = f["totals"], []
    top = f["top_categories"][0] if f["top_categories"] else None
    if top:
        out.append({"title": f"{top['category']} is your biggest expense",
                    "detail": f"{A.inr(top['amount'])} over the period — {top['share_pct']}% of all spending.", "type": "info"})
    mom = f.get("month_over_month")
    if mom and mom["categories"]:
        c = mom["categories"][0]
        up = c["change"] > 0
        out.append({"title": f"{c['category']} {'rose' if up else 'fell'} in {mom['to_month']}",
                    "detail": f"From {A.inr(c['from'])} in {mom['from_month']} to {A.inr(c['to'])}.",
                    "type": "warning" if up else "positive"})
    s = f["subscriptions"]
    if s["count"]:
        out.append({"title": f"{s['count']} active subscriptions",
                    "detail": f"They cost {A.inr(s['monthly_total'])} a month, or {A.inr(s['annual_total'])} a year.",
                    "type": "warning" if s["monthly_total"] > 2000 else "info"})
    w = f["weekday_vs_weekend"]
    out.append({"title": "Weekend vs weekday spending",
                "detail": f"{A.inr(w['weekend_avg_per_day'])}/day on weekends vs {A.inr(w['weekday_avg_per_day'])}/day on weekdays.",
                "type": "info"})
    out.append({"title": f"Savings rate {t['savings_rate_pct']}%",
                "detail": f"You saved {A.inr(t['net_savings'])} of {A.inr(t['income'])} income.",
                "type": "positive" if t["savings_rate_pct"] >= 20 else "warning"})
    return {"headline": f"You spent {A.inr(t['spent'])} and saved {t['savings_rate_pct']}% of your income over {f['period']}.",
            "insights": out}


async def generate_insights(df: pd.DataFrame) -> dict:
    facts = A.fact_sheet(df)
    if llm.available:
        instr = ('Write a one-sentence "headline" summarising the user\'s finances, then 5 "insights" about spending '
                 'patterns, unusual changes and habits (each: "title" ≤ 8 words, "detail" 1-2 sentences, "type" one of '
                 'positive|warning|info). Reply JSON {"headline": "...", "insights": [...]}')
        try:
            data, rep, attempts = await grounded_json("You are FinWise, an AI that explains spending habits in plain language.",
                                                      facts, instr, lambda d: json.dumps(d, ensure_ascii=False))
            if rep.gfs == 1.0 and data.get("insights"):
                return {**data, "verification": rep.as_dict(), "attempts": attempts, "source": "llm"}
        except (LLMError, json.JSONDecodeError, KeyError, TypeError):
            pass
    data = _template_insights(facts)
    return {**data, "verification": verify(json.dumps(data, ensure_ascii=False), facts).as_dict(), "source": "template"}


async def health_rationale(df: pd.DataFrame) -> str:
    h = A.health_score(df)
    weakest = min(h["components"], key=lambda c: c["points"] / c["max"])
    best = max(h["components"], key=lambda c: c["points"] / c["max"])
    msg = {"Excellent": "You're spending well within your means!", "Good": "You're on a solid footing.",
           "Fair": "You're doing okay, with room to improve.", "Needs attention": "Your spending needs attention."}[h["label"]]
    return f"{msg} Strongest: {best['name'].lower()} ({best['value']}). Work on: {weakest['name'].lower()} ({weakest['value']})."
