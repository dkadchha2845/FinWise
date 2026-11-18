"""Deterministic analytics engine: every number FinWise shows or says comes from here."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .categories import ESSENTIAL, NON_SPEND

SPIKE_EXCLUDE = {"Transfers", "Cash Withdrawal", "Rent & Housing", "EMI & Loans", "Income"}
Z_THRESH = 3.5
MIN_ANOMALY_AMT = 500.0


def r2(x) -> float:
    return float(round(float(x), 2))


def inr(v: float) -> str:
    """Format rupees with Indian digit grouping: 125000 -> ₹1,25,000."""
    n = f"{abs(float(v)):.0f}"
    if len(n) > 3:
        head, tail = n[:-3], n[-3:]
        head = ",".join([head[max(0, i - 2):i] for i in range(len(head), 0, -2)][::-1])
        n = f"{head},{tail}"
    return ("-₹" if float(v) < 0 else "₹") + n


def month_key(s: pd.Series) -> pd.Series:
    return s.dt.strftime("%Y-%m")


def months(df: pd.DataFrame) -> list[str]:
    return sorted(month_key(df["date"]).unique().tolist())


def resolve_month(df: pd.DataFrame, month: str | None) -> str | None:
    ms = months(df)
    if not month or month in ("all", "null", "None"):
        return None
    if month in ("latest", "current", "this_month", "last"):
        return ms[-1]
    if month in ("previous", "prev", "last_month"):
        return ms[-2] if len(ms) > 1 else ms[-1]
    if month in ms:
        return month
    for m in ms:  # tolerate "October", "oct", "2026-10-01"
        label = pd.Timestamp(m + "-01").strftime("%B").lower()
        if month.lower()[:3] == label[:3] or month.startswith(m):
            return m
    return None


def month_label(m: str | None) -> str:
    return pd.Timestamp(m + "-01").strftime("%B %Y") if m else "all months"


def filt(df: pd.DataFrame, month: str | None = None) -> pd.DataFrame:
    return df[month_key(df["date"]) == month] if month else df


def spend(df: pd.DataFrame) -> pd.DataFrame:
    return df[(df["direction"] == "debit") & (~df["category"].isin(NON_SPEND))]


# ---------------------------------------------------------------- aggregates
def overview(df: pd.DataFrame, month: str | None = None) -> dict:
    d = filt(df, month)
    income = d[(d["direction"] == "credit") & (d["category"] == "Income")]["amount"].sum()
    sp = spend(d)
    spent = sp["amount"].sum()
    by_cat = sp.groupby("category")["amount"].agg(["sum", "count"]).sort_values("sum", ascending=False)
    n_months = max(1, len(months(d)))
    bills = sp[sp["category"].isin({"Bills & Utilities", "Subscriptions", "EMI & Loans", "Rent & Housing"})]["amount"].sum()
    return {
        "period": month_label(month),
        "month": month,
        "income": r2(income),
        "spent": r2(spent),
        "net_savings": r2(income - spent),
        "savings_rate_pct": r2(100 * (income - spent) / income) if income else 0.0,
        "fixed_commitments": r2(bills),
        "avg_monthly_spend": r2(spent / n_months),
        "transactions": int(len(d)),
        "by_category": [{"category": c, "amount": r2(v["sum"]), "count": int(v["count"]),
                         "share_pct": r2(100 * v["sum"] / spent) if spent else 0.0} for c, v in by_cat.iterrows()],
    }


def monthly_trend(df: pd.DataFrame) -> list[dict]:
    out = []
    for m in months(df):
        o = overview(df, m)
        out.append({"month": m, "label": pd.Timestamp(m + "-01").strftime("%b"), "income": o["income"],
                     "spent": o["spent"], "savings": o["net_savings"]})
    return out


def category_detail(df: pd.DataFrame, category: str, month: str | None = None) -> dict:
    d = spend(filt(df, month))
    c = d[d["category"].str.lower() == category.lower()]
    tm = c.groupby("merchant")["amount"].agg(["sum", "count"]).sort_values("sum", ascending=False).head(5)
    return {"category": category, "period": month_label(month), "total": r2(c["amount"].sum()), "count": int(len(c)),
            "average": r2(c["amount"].mean()) if len(c) else 0.0, "largest": r2(c["amount"].max()) if len(c) else 0.0,
            "top_merchants": [{"merchant": m, "amount": r2(v["sum"]), "count": int(v["count"])} for m, v in tm.iterrows()]}


def top_merchants(df: pd.DataFrame, n: int = 5, month: str | None = None, category: str | None = None) -> list[dict]:
    d = spend(filt(df, month))
    if category:
        d = d[d["category"].str.lower() == category.lower()]
    g = d.groupby(["merchant", "category"])["amount"].agg(["sum", "count"]).sort_values("sum", ascending=False).head(n)
    return [{"merchant": m, "category": c, "amount": r2(v["sum"]), "count": int(v["count"])} for (m, c), v in g.iterrows()]


def compare_months(df: pd.DataFrame, a: str, b: str) -> dict:
    oa, ob = overview(df, a), overview(df, b)
    ca = {x["category"]: x["amount"] for x in oa["by_category"]}
    cb = {x["category"]: x["amount"] for x in ob["by_category"]}
    rows = []
    for c in sorted(set(ca) | set(cb)):
        va, vb = ca.get(c, 0.0), cb.get(c, 0.0)
        rows.append({"category": c, "from": va, "to": vb, "change": r2(vb - va),
                     "change_pct": r2(100 * (vb - va) / va) if va else None})
    rows.sort(key=lambda r: abs(r["change"]), reverse=True)
    return {"from_month": month_label(a), "to_month": month_label(b), "spent_from": oa["spent"], "spent_to": ob["spent"],
            "total_change": r2(ob["spent"] - oa["spent"]),
            "total_change_pct": r2(100 * (ob["spent"] - oa["spent"]) / oa["spent"]) if oa["spent"] else None,
            "categories": rows}


def find_transactions(df: pd.DataFrame, query: str | None = None, category: str | None = None,
                      min_amount: float | None = None, max_amount: float | None = None, month: str | None = None,
                      direction: str | None = None, limit: int = 10) -> dict:
    d = filt(df, month)
    if query:
        q = query.lower()
        d = d[d["merchant"].str.lower().str.contains(q, regex=False) | d["description"].str.lower().str.contains(q, regex=False)]
    if category:
        d = d[d["category"].str.lower() == category.lower()]
    if min_amount is not None:
        d = d[d["amount"] >= float(min_amount)]
    if max_amount is not None:
        d = d[d["amount"] <= float(max_amount)]
    if direction in ("debit", "credit"):
        d = d[d["direction"] == direction]
    top = d.sort_values("amount", ascending=False).head(limit)
    return {"matches": int(len(d)), "total": r2(d["amount"].sum()),
            "transactions": [{"date": t.date.strftime("%d %b %Y"), "merchant": t.merchant, "category": t.category,
                              "amount": r2(t.amount), "direction": t.direction} for t in top.itertuples()]}


# ---------------------------------------------------------------- patterns
def recurring(df: pd.DataFrame) -> list[dict]:
    d = df[df["direction"] == "debit"]
    end = df["date"].max()
    out = []
    for (m, cat), g in d.groupby(["merchant", "category"]):
        if cat in ("Transfers", "Cash Withdrawal"):
            continue
        g = g.sort_values("date").drop_duplicates(subset=["date", "amount"])
        per_month = g.groupby(month_key(g["date"]))["amount"].median()
        if len(per_month) < 2 or len(per_month) < len(months(df)) - 1:
            continue
        amts = g["amount"]
        cv = amts.std(ddof=0) / amts.mean() if amts.mean() else 1
        gaps = g["date"].diff().dt.days.dropna()
        billish = cat in ("Bills & Utilities", "Subscriptions", "Rent & Housing", "EMI & Loans")
        max_cv = 0.35 if billish else 0.03
        if not billish and len(per_month) < len(months(df)):
            continue
        if cv > max_cv or len(g) > len(per_month) * 1.5:
            continue
        if len(gaps) and not (20 <= gaps.median() <= 40):
            continue
        amt = per_month.iloc[-1]
        nxt = g["date"].iloc[-1] + pd.Timedelta(days=int(round(gaps.median())) if len(gaps) else 30)
        out.append({"merchant": m, "category": cat, "monthly_amount": r2(amt), "annual_cost": r2(amt * 12),
                    "months_seen": int(len(per_month)), "last_paid": g["date"].iloc[-1].strftime("%d %b %Y"),
                    "next_expected": nxt.strftime("%d %b %Y"), "next_expected_iso": nxt.strftime("%Y-%m-%d"),
                    "days_until": int((nxt - end).days)})
    out.sort(key=lambda r: r["monthly_amount"], reverse=True)
    return out


def subscriptions(df: pd.DataFrame) -> dict:
    rec = [r for r in recurring(df) if r["category"] == "Subscriptions"]
    total = sum(r["monthly_amount"] for r in rec)
    return {"count": len(rec), "monthly_total": r2(total), "annual_total": r2(total * 12), "items": rec}


def upcoming_bills(df: pd.DataFrame, days: int = 30) -> dict:
    items = [r for r in recurring(df) if 0 <= r["days_until"] <= days or r["days_until"] < 0]
    items.sort(key=lambda r: r["next_expected_iso"])
    return {"as_of": df["date"].max().strftime("%d %b %Y"), "window_days": days,
            "total_due": r2(sum(r["monthly_amount"] for r in items)), "bills": items}


def weekday_weekend(df: pd.DataFrame) -> dict:
    sp = spend(df)
    sp = sp[~sp["category"].isin({"Rent & Housing", "EMI & Loans", "Bills & Utilities"})]
    days = pd.date_range(df["date"].min(), df["date"].max())
    n_we = int((days.dayofweek >= 5).sum()) or 1
    n_wd = int((days.dayofweek < 5).sum()) or 1
    we = sp[sp["date"].dt.dayofweek >= 5]["amount"].sum()
    wd = sp[sp["date"].dt.dayofweek < 5]["amount"].sum()
    by_dow = sp.groupby(sp["date"].dt.dayofweek)["amount"].sum()
    dow_days = pd.Series(days.dayofweek).value_counts()
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return {"weekday_avg_per_day": r2(wd / n_wd), "weekend_avg_per_day": r2(we / n_we),
            "weekend_vs_weekday_ratio": r2((we / n_we) / (wd / n_wd)) if wd else 0.0,
            "by_day": [{"day": names[i], "avg": r2(by_dow.get(i, 0) / max(1, dow_days.get(i, 1)))} for i in range(7)]}


def mom_change(df: pd.DataFrame) -> dict | None:
    ms = months(df)
    if len(ms) < 2:
        return None
    return compare_months(df, ms[-2], ms[-1])


# ---------------------------------------------------------------- anomalies
def _robust_z(x: np.ndarray, ref: np.ndarray) -> np.ndarray:
    med = np.median(ref)
    mad = np.median(np.abs(ref - med))
    if mad < 1e-9:
        mad = np.mean(np.abs(ref - med)) or (med * 0.1 or 1.0)
    return 0.6745 * (x - med) / mad


def detect_anomalies(df: pd.DataFrame, method: str = "finwise", disable: frozenset = frozenset()) -> pd.DataFrame:
    """method: 'finwise' (robust z per category + per merchant + duplicate + new merchant),
               'zscore_category' (mean/std z>3 per category), 'zscore_global' (mean/std z>3 over all debits)."""
    df = df.copy()
    df["is_anomaly"], df["anomaly_type"], df["anomaly_score"], df["anomaly_reason"] = 0, "", 0.0, ""
    deb = df[(df["direction"] == "debit")]
    cand = deb[~deb["category"].isin(SPIKE_EXCLUDE)]

    def flag(idx, typ, score, reason):
        if df.at[idx, "is_anomaly"] and df.at[idx, "anomaly_score"] >= score:
            return
        df.at[idx, "is_anomaly"], df.at[idx, "anomaly_type"] = 1, typ
        df.at[idx, "anomaly_score"], df.at[idx, "anomaly_reason"] = float(round(score, 2)), reason

    if method == "zscore_global":
        a = cand["amount"].to_numpy()
        z = (a - a.mean()) / (a.std() or 1)
        for idx, zz in zip(cand.index, z):
            if zz > 3:
                flag(idx, "spike", zz, f"z-score {zz:.1f} over all spending")
        return df

    merch_count = cand.groupby("merchant")["amount"].transform("count")
    merch_med = cand.groupby("merchant")["amount"].transform("median")
    for cat, g in cand.groupby("category"):
        if method == "finwise" and len(g) < 5 and "min_history" not in disable:
            continue  # not enough history: left to the new-merchant rule
        ref = g["amount"].to_numpy() if len(g) >= 5 else cand["amount"].to_numpy()
        a = g["amount"].to_numpy()
        if method == "zscore_category":
            mu, sd = ref.mean(), ref.std() or 1
            for idx, v in zip(g.index, a):
                if (v - mu) / sd > 3:
                    flag(idx, "spike", (v - mu) / sd, f"z-score {(v - mu) / sd:.1f} within {cat}")
            continue
        med = float(np.median(ref))
        for idx, v, z in zip(g.index, a, _robust_z(a, ref)):
            # habitual-merchant suppression: a regular payee charging its usual amount is not unusual
            if "suppression" not in disable and merch_count[idx] >= 3 and v <= 2 * merch_med[idx]:
                continue
            if z > Z_THRESH and v >= MIN_ANOMALY_AMT and v >= 2.5 * med:
                flag(idx, "spike", z, f"{inr(v)} is {v / med:.1f}× your median {cat} spend of {inr(med)}")
    if method != "finwise":
        return df

    # merchant-level spikes (catches e.g. a ₹2,380 cab ride when rides are usually ₹250)
    for m, g in cand.groupby("merchant"):
        if len(g) < 4 or "merchant" in disable:
            continue
        a = g["amount"].to_numpy()
        med = float(np.median(a))
        for idx, v, z in zip(g.index, a, _robust_z(a, a)):
            if z > Z_THRESH and v >= MIN_ANOMALY_AMT and v >= 3 * med:
                flag(idx, "spike", z, f"{inr(v)} at {m} is {v / med:.1f}× your usual {inr(med)} there")

    # duplicate charges: same merchant + same amount within 1 day
    s = deb.sort_values(["merchant", "amount", "date"])
    prev = None
    for idx, r in s.iterrows():
        if "duplicate" not in disable and prev is not None and r["merchant"] == prev["merchant"] and r["amount"] == prev["amount"] \
                and (r["date"] - prev["date"]).days <= 1 and r["category"] not in ("Transfers", "Cash Withdrawal"):
            when = (f"on {r['date'].strftime('%d %b')}" if r["date"] == prev["date"]
                    else f"on {prev['date'].strftime('%d %b')} and {r['date'].strftime('%d %b')}")
            flag(idx, "duplicate", 5.0, f"Charged {inr(r['amount'])} twice at {r['merchant']} {when}")
        prev = r

    # new merchant + high value in the latest month
    ms = months(df)
    if len(ms) >= 2 and "new_merchant" not in disable:
        latest = month_key(cand["date"]) == ms[-1]
        seen_before = set(cand[~latest]["merchant"])
        p95 = float(np.percentile(cand["amount"], 95)) if len(cand) else 0
        thresh = max(5000.0, p95)
        for idx, r in cand[latest].iterrows():
            if r["merchant"] not in seen_before and r["amount"] >= thresh:
                reason = (f"First-ever payment to {r['merchant']}, and at {inr(r['amount'])} it is above 95% of "
                          f"your other expenses ({inr(p95)})")
                df.at[idx, "anomaly_score"] = max(4.0, float(df.at[idx, "anomaly_score"]))
                if df.at[idx, "is_anomaly"]:
                    reason += "; " + df.at[idx, "anomaly_reason"]
                df.at[idx, "is_anomaly"], df.at[idx, "anomaly_type"], df.at[idx, "anomaly_reason"] = 1, "new_merchant", reason
    return df


def anomalies(df: pd.DataFrame) -> list[dict]:
    a = df[df["is_anomaly"] == 1].sort_values("date", ascending=False)
    return [{"id": int(r.id), "date": r.date.strftime("%d %b %Y"), "merchant": r.merchant, "category": r.category,
             "amount": r2(r.amount), "type": r.anomaly_type, "score": r2(r.anomaly_score), "reason": r.anomaly_reason,
             "explanation": getattr(r, "explanation", None), "suggestion": getattr(r, "suggestion", None)}
            for r in a.itertuples()]


# ---------------------------------------------------------------- health + budget
def health_score(df: pd.DataFrame) -> dict:
    o = overview(df)
    n_months = max(1, len(months(df)))
    income_m = o["income"] / n_months
    sp = spend(df)
    sr = o["savings_rate_pct"]
    s_save = float(np.clip(sr / 30 * 40, 0, 40))
    essential = sp[sp["category"].isin(ESSENTIAL)]["amount"].sum()
    disc_share = 100 * (1 - essential / o["spent"]) if o["spent"] else 0
    s_disc = float(np.clip(20 - max(0, disc_share - 30) * 0.5, 0, 20))
    subs = subscriptions(df)
    sub_pct = 100 * subs["monthly_total"] / income_m if income_m else 0
    s_sub = float(np.clip(15 - max(0, sub_pct - 3) * 3, 0, 15))
    n_anom = int(df["is_anomaly"].sum()) if "is_anomaly" in df else 0
    s_anom = float(np.clip(10 - 1.5 * n_anom, 0, 10))
    monthly = [t["spent"] for t in monthly_trend(df)]
    cv = float(np.std(monthly) / np.mean(monthly)) if len(monthly) > 1 and np.mean(monthly) else 0
    s_stab = float(np.clip(15 - cv * 30, 0, 15))
    score = int(round(s_save + s_disc + s_sub + s_anom + s_stab))
    label = "Excellent" if score >= 80 else "Good" if score >= 65 else "Fair" if score >= 45 else "Needs attention"
    return {"score": score, "label": label, "components": [
        {"name": "Savings rate", "points": r2(s_save), "max": 40, "value": f"{sr:.1f}%"},
        {"name": "Discretionary share", "points": r2(s_disc), "max": 20, "value": f"{disc_share:.1f}%"},
        {"name": "Subscription load", "points": r2(s_sub), "max": 15, "value": f"{sub_pct:.1f}% of income"},
        {"name": "Unusual expenses", "points": r2(s_anom), "max": 10, "value": f"{n_anom} flagged"},
        {"name": "Spending stability", "points": r2(s_stab), "max": 15, "value": f"CV {cv:.2f}"},
    ], "savings_rate_pct": sr, "discretionary_share_pct": r2(disc_share), "subscription_pct_of_income": r2(sub_pct),
        "unusual_expenses": n_anom}


def budget_suggestion(df: pd.DataFrame) -> dict:
    """50/30/20 rule applied to average monthly income, compared with actual average spend."""
    n = max(1, len(months(df)))
    o = overview(df)
    income = o["income"] / n
    needs_b, wants_b, save_b = income * 0.5, income * 0.3, income * 0.2
    cats = {c["category"]: c["amount"] / n for c in o["by_category"]}
    needs = sum(v for c, v in cats.items() if c in ESSENTIAL)
    wants = sum(v for c, v in cats.items() if c not in ESSENTIAL)
    scale = min(1.0, wants_b / wants) if wants else 1.0
    rows = []
    for c, v in sorted(cats.items(), key=lambda kv: -kv[1]):
        cap = v if c in ESSENTIAL else v * scale
        rows.append({"category": c, "avg_monthly": r2(v), "suggested_cap": r2(cap), "cut": r2(v - cap),
                     "type": "need" if c in ESSENTIAL else "want"})
    return {"avg_monthly_income": r2(income), "needs_budget": r2(needs_b), "wants_budget": r2(wants_b),
            "savings_target": r2(save_b), "current_needs": r2(needs), "current_wants": r2(wants),
            "current_savings": r2(income - needs - wants), "categories": rows}


def fact_sheet(df: pd.DataFrame) -> dict:
    """Compact, fully-computed summary used to ground LLM narration."""
    ms = months(df)
    o = overview(df)
    return {
        "period": f"{month_label(ms[0])} – {month_label(ms[-1])}", "months": len(ms),
        "totals": {k: o[k] for k in ("income", "spent", "net_savings", "savings_rate_pct", "avg_monthly_spend")},
        "top_categories": o["by_category"][:6],
        "monthly": monthly_trend(df),
        "month_over_month": mom_change(df),
        "top_merchants": top_merchants(df, 5),
        "subscriptions": subscriptions(df),
        "weekday_vs_weekend": {k: v for k, v in weekday_weekend(df).items() if k != "by_day"},
        "unusual_expenses": [{k: a[k] for k in ("date", "merchant", "category", "amount", "reason")} for a in anomalies(df)],
        "health": {k: v for k, v in health_score(df).items() if k != "components"},
    }
