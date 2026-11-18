"""Hybrid cost-aware categoriser: merchant cache -> rule dictionary -> batched LLM -> fallback."""
from __future__ import annotations

import json

import pandas as pd

from . import db
from .categories import CATEGORIES, extract_merchant, rule_category
from .llm import LLMError, llm
from .privacy import is_person, masked_view

BATCH = 30

SYSTEM = f"""You classify Indian bank-statement transactions (INR, UPI/NEFT/POS/ACH narrations).
Allowed categories (use EXACTLY one of these strings): {json.dumps(CATEGORIES)}.
Guidelines:
- Restaurants, cafes, food delivery -> "Food & Dining"; supermarkets, kirana, vegetables -> "Groceries".
- Cabs, bikes, fuel stations, metro, flights, train, travel booking sites -> "Transport".
- Hotels and resorts, movies, gaming, amusement parks -> "Entertainment".
- Monthly software / streaming / gym memberships -> "Subscriptions".
- Electricity, gas cylinder, water, mobile, broadband -> "Bills & Utilities".
- Rental platforms or monthly rent -> "Rent & Housing"; loan / finance company ACH debits -> "EMI & Loans".
- Clinics, labs, pharmacies, doctor apps -> "Health"; courses / ed-tech -> "Education".
- Payments to or from a private person ([PERSON]) -> "Transfers".
- Credits from employers, clients, freelance platforms, payment gateways payouts -> "Income".
Reply with JSON: {{"results": [{{"i": <index>, "category": "<category>"}}]}} covering every item."""

FEW_SHOT_USER = json.dumps([
    {"i": 0, "text": "POS XXXX93 FOOD HALL BANGALORE", "direction": "debit", "amount": 640},
    {"i": 1, "text": "UPI/DR/XXXX21/[PERSON]/okaxis/Split", "direction": "debit", "amount": 450},
    {"i": 2, "text": "NEFT/NXXXX10/TOPTAL LLC/INVOICE", "direction": "credit", "amount": 52000},
])
FEW_SHOT_ASSISTANT = json.dumps({"results": [
    {"i": 0, "category": "Groceries"}, {"i": 1, "category": "Transfers"}, {"i": 2, "category": "Income"}]})


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["merchant"] = df["description"].map(extract_merchant)
    df["masked"] = [masked_view(d, m) for d, m in zip(df["description"], df["merchant"])]
    return df


def _mock_guess(direction: str, merchant: str, amount: float) -> str:
    if is_person(merchant):
        return "Transfers"
    if direction == "credit":
        return "Income" if amount >= 10000 else "Transfers"
    return "Other"


async def _llm_batch(items: list[dict]) -> dict[int, str]:
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": FEW_SHOT_USER}, {"role": "assistant", "content": FEW_SHOT_ASSISTANT},
            {"role": "user", "content": json.dumps(items)}]
    out = await llm.complete_json(msgs, temperature=0.0, max_tokens=2000)
    res = {}
    for r in out.get("results", []):
        cat = r.get("category")
        if cat in CATEGORIES and isinstance(r.get("i"), int):
            res[r["i"]] = cat
    return res


async def categorize(df: pd.DataFrame, mode: str = "hybrid", use_cache: bool = True) -> pd.DataFrame:
    """mode: 'hybrid' (rules + LLM for unknowns), 'rules' (rules only), 'llm' (LLM for everything)."""
    df = df.copy()
    cats: list[str | None] = [None] * len(df)
    srcs: list[str] = [""] * len(df)
    keys = list(zip(df["merchant"], df["direction"]))

    if use_cache and mode == "hybrid":
        cached = db.merchant_cache_get(keys)
        for i, k in enumerate(keys):
            if k in cached:
                cats[i], srcs[i] = cached[k][0], cached[k][1]
    if mode in ("hybrid", "rules"):
        for i, (desc, d) in enumerate(zip(df["description"], df["direction"])):
            if cats[i] is None and (c := rule_category(desc, d)):
                cats[i], srcs[i] = c, "rule"

    pending = [i for i, c in enumerate(cats) if c is None]
    if mode != "rules" and pending and llm.available:
        # one LLM item per unique (merchant, direction) – the representative row carries the context
        uniq: dict[tuple[str, str], int] = {}
        for i in pending:
            uniq.setdefault(keys[i], i)
        reps = list(uniq.items())
        results: dict[tuple[str, str], str] = {}
        for b in range(0, len(reps), BATCH):
            chunk = reps[b:b + BATCH]
            items = [{"i": j, "text": df["masked"].iat[ri], "direction": df["direction"].iat[ri],
                      "amount": round(float(df["amount"].iat[ri]))} for j, (_, ri) in enumerate(chunk)]
            try:
                got = await _llm_batch(items)
            except LLMError:
                got = {}
            for j, (k, _) in enumerate(chunk):
                if j in got:
                    results[k] = got[j]
        for i in pending:
            if keys[i] in results:
                cats[i], srcs[i] = results[keys[i]], "llm"
        if use_cache and mode == "hybrid" and results:
            db.merchant_cache_put([(m, d, c, "llm") for (m, d), c in results.items()])

    for i, c in enumerate(cats):
        if c is None:
            if mode == "rules":
                cats[i], srcs[i] = "Other", "default"
            else:
                cats[i] = _mock_guess(df["direction"].iat[i], df["merchant"].iat[i], float(df["amount"].iat[i]))
                srcs[i] = "heuristic"
    df["category"] = cats
    df["category_source"] = srcs
    return df
