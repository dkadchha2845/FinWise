"""FinWise evaluation: produces every table and figure used in the IEEE paper.

Usage (from backend/):
    .venv/bin/python -m eval.run               # all experiments (needs an LLM key in .env)
    .venv/bin/python -m eval.run --offline     # only experiments that need no LLM

Outputs: eval/results/results.json, eval/results/tables.md, eval/results/*.png
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "eval" / "results"
OUT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("FINWISE_DB", str(OUT / "eval.db"))

import pandas as pd  # noqa: E402
from sklearn.metrics import accuracy_score, f1_score  # noqa: E402

from app import analytics as A  # noqa: E402
from app import db  # noqa: E402
from app.categorize import categorize, prepare  # noqa: E402
from app.chat import answer  # noqa: E402
from app.llm import STATS, llm  # noqa: E402
from app.verify import extract_claims, verify  # noqa: E402

PERSONAS = ["aarav", "priya", "rohan"]


def load(p: str) -> pd.DataFrame:
    rows = json.loads((ROOT / "data" / "labels" / f"{p}.json").read_text())
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df.rename(columns={"category": "true_category", "is_anomaly": "true_anomaly"})
    df = prepare(df)
    df["id"] = range(len(df))
    return df


# ------------------------------------------------------------------ E1: categorisation
async def exp_categorisation(dfs: dict[str, pd.DataFrame], modes: list[str]) -> dict:
    res = {}
    for mode in modes:
        y_true, y_pred, n_llm_items = [], [], 0
        STATS.reset()
        t0 = time.perf_counter()
        for p, df in dfs.items():
            out = await categorize(df, mode=mode, use_cache=False)
            y_true += df["true_category"].tolist()
            y_pred += out["category"].tolist()
            n_llm_items += int((out["category_source"] == "llm").sum())
            dfs[p][f"pred_{mode}"] = out["category"].values
        res[mode] = {
            "accuracy": round(accuracy_score(y_true, y_pred), 4),
            "macro_f1": round(f1_score(y_true, y_pred, average="macro", zero_division=0), 4),
            "weighted_f1": round(f1_score(y_true, y_pred, average="weighted", zero_division=0), 4),
            "llm_calls": STATS.calls, "prompt_tokens": STATS.prompt_tokens, "completion_tokens": STATS.completion_tokens,
            "txns_labelled_by_llm": n_llm_items, "seconds": round(time.perf_counter() - t0, 2), "n": len(y_true),
        }
        print(f"[E1] {mode:7s} acc={res[mode]['accuracy']:.3f} macroF1={res[mode]['macro_f1']:.3f} "
              f"calls={STATS.calls} tokens={STATS.prompt_tokens + STATS.completion_tokens}")
    return res


# ------------------------------------------------------------------ E2: anomaly detection
def exp_anomaly(dfs: dict[str, pd.DataFrame], cat_col: str) -> dict:
    res = {}
    for method in ["zscore_global", "zscore_category", "finwise"]:
        tp = fp = fn = 0
        for df in dfs.values():
            d = df.copy()
            d["category"] = d[cat_col]
            out = A.detect_anomalies(d, method)
            pred, true = out["is_anomaly"] == 1, d["true_anomaly"] == True  # noqa: E712
            tp += int((pred & true).sum()); fp += int((pred & ~true).sum()); fn += int((~pred & true).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        res[method] = {"tp": tp, "fp": fp, "fn": fn, "precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}
        print(f"[E2] {cat_col:13s} {method:16s} P={prec:.3f} R={rec:.3f} F1={f1:.3f}")
    return res


def exp_ablation(dfs: dict[str, pd.DataFrame]) -> dict:
    """Remove one component of the FinWise detector at a time (ground-truth categories)."""
    res = {}
    for name in ["full", "suppression", "min_history", "merchant", "duplicate", "new_merchant"]:
        tp = fp = fn = 0
        for df in dfs.values():
            d = df.copy()
            d["category"] = d["true_category"]
            out = A.detect_anomalies(d, "finwise", frozenset() if name == "full" else frozenset({name}))
            pred, true = out["is_anomaly"] == 1, d["true_anomaly"] == True  # noqa: E712
            tp += int((pred & true).sum()); fp += int((pred & ~true).sum()); fn += int((~pred & true).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        res[name] = {"tp": tp, "fp": fp, "fn": fn, "precision": round(prec, 4), "recall": round(rec, 4),
                     "f1": round(2 * prec * rec / (prec + rec), 4) if prec + rec else 0.0}
        print(f"[E2b] -{name:13s} P={prec:.3f} R={rec:.3f}")
    return res


# ------------------------------------------------------------------ E3/E4: QA faithfulness + correctness
def questions(df: pd.DataFrame) -> list[tuple[str, float, str]]:
    """(question, expected key number, kind) computed from GROUND-TRUTH categories."""
    g = df.copy()
    g["category"] = g["true_category"]
    g["is_anomaly"] = 0
    ms = A.months(g)
    lab = lambda m: pd.Timestamp(m + "-01").strftime("%B %Y")  # noqa: E731
    top = A.top_merchants(g, 1)[0]
    return [
        (f"How much did I spend on Food & Dining in {lab(ms[1])}?", A.category_detail(g, "Food & Dining", ms[1])["total"], "amount"),
        (f"What was my total spending in {lab(ms[-1])}?", A.overview(g, ms[-1])["spent"], "amount"),
        ("Which merchant did I spend the most money at overall, and how much?", top["amount"], "amount"),
        ("How much do my subscriptions cost me per year?", A.subscriptions(g)["annual_total"], "amount"),
        (f"By how much did my total spending change from {lab(ms[-2])} to {lab(ms[-1])}?",
         A.compare_months(g, ms[-2], ms[-1])["total_change"], "amount"),
        ("What is my overall savings rate across all months?", A.overview(g)["savings_rate_pct"], "percent"),
        (f"How much did I spend on Transport in {lab(ms[-1])}?", A.category_detail(g, "Transport", ms[-1])["total"], "amount"),
        ("What was my single largest Shopping purchase?", A.category_detail(g, "Shopping")["largest"], "amount"),
        (f"How much income did I receive in {lab(ms[0])}?", A.overview(g, ms[0])["income"], "amount"),
        ("How much did I spend on Groceries over all three months?", A.category_detail(g, "Groceries")["total"], "amount"),
    ]


def correct(text: str, expected: float, kind: str) -> bool:
    for c in extract_claims(text):
        if kind == "percent" and c.kind != "percent":
            continue
        tol = 0.6 if kind == "percent" else max(1.0, 0.01 * abs(expected), c.tol)
        if abs(abs(c.value) - abs(expected)) <= tol:
            return True
    return False


async def exp_qa(dfs: dict[str, pd.DataFrame], limit: int | None) -> dict:
    variants = {"stuffing": {}, "tool": {"verify_retry": False}, "tool+verify": {"verify_retry": True}}
    res = {v: {"n": 0, "correct": 0, "claims": 0, "supported": 0, "gfs_sum": 0.0, "fully_verified": 0, "tokens": 0,
               "calls": 0, "seconds": 0.0} for v in variants}
    samples = []
    for p, df in dfs.items():
        d = df.copy()
        d["category"] = d["pred_hybrid"] if "pred_hybrid" in d else d["true_category"]
        d = A.detect_anomalies(d)
        facts_all = {"facts": A.fact_sheet(d), "txn_amounts": d["amount"].tolist()}
        for q, exp, kind in questions(df)[:limit]:
            for v, kw in variants.items():
                STATS.reset()
                t0 = time.perf_counter()
                try:
                    out = await answer(d, q, variant="stuffing" if v == "stuffing" else "tool", use_cache=True, **kw)
                except Exception as e:  # keep the run going on transient API errors
                    print("   !", v, q, str(e)[:120])
                    continue
                text = out["text"]
                ground = {**facts_all, "question": q} if v == "stuffing" else out["result"]
                rep = verify(text, ground)
                r = res[v]
                r["n"] += 1; r["correct"] += correct(text, exp, kind); r["claims"] += rep.total
                r["supported"] += rep.supported; r["gfs_sum"] += rep.gfs; r["fully_verified"] += rep.gfs == 1.0
                r["tokens"] += STATS.prompt_tokens + STATS.completion_tokens; r["calls"] += STATS.calls
                r["seconds"] += time.perf_counter() - t0
                samples.append({"persona": p, "variant": v, "q": q, "expected": exp, "answer": text,
                                "correct": correct(text, exp, kind), "gfs": rep.gfs, "unsupported": rep.unsupported})
            print(f"[E3] {p} · {q[:60]}")
    for v, r in res.items():
        n = max(1, r["n"])
        r.update({"accuracy": round(r["correct"] / n, 4), "claim_precision": round(r["supported"] / max(1, r["claims"]), 4),
                  "mean_gfs": round(r["gfs_sum"] / n, 4), "fully_verified_rate": round(r["fully_verified"] / n, 4),
                  "avg_tokens": round(r["tokens"] / n), "avg_latency_s": round(r["seconds"] / n, 2)})
    (OUT / "qa_samples.json").write_text(json.dumps(samples, indent=1, ensure_ascii=False))
    return res


# ------------------------------------------------------------------ figures + tables
def figures(R: dict):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.family": "serif", "font.size": 9, "figure.dpi": 200})
    if "categorisation" in R:
        c = R["categorisation"]
        modes = list(c)
        fig, ax = plt.subplots(figsize=(3.4, 2.2))
        x = range(len(modes))
        ax.bar([i - 0.18 for i in x], [c[m]["accuracy"] for m in modes], 0.36, label="Accuracy", color="#6d4aff")
        ax.bar([i + 0.18 for i in x], [c[m]["macro_f1"] for m in modes], 0.36, label="Macro-F1", color="#22d3ee")
        ax.set_xticks(list(x)); ax.set_xticklabels([m.replace("llm", "LLM-only").replace("rules", "Rules-only").replace("hybrid", "Hybrid") for m in modes])
        ax.set_ylim(0, 1.0); ax.legend(frameon=False, fontsize=6.5, ncol=2, loc="lower center", bbox_to_anchor=(0.5, 1.0)); ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout(); fig.savefig(OUT / "fig_categorisation.png"); plt.close(fig)
    if "anomaly_true_categories" in R:
        a = R["anomaly_true_categories"]
        names = {"zscore_global": "Global z", "zscore_category": "Category z", "finwise": "FinWise"}
        fig, ax = plt.subplots(figsize=(3.4, 2.2))
        ks = list(a)
        w = 0.26
        for j, (met, col) in enumerate([("precision", "#6d4aff"), ("recall", "#22d3ee"), ("f1", "#f472b6")]):
            ax.bar([i + (j - 1) * w for i in range(len(ks))], [a[k][met] for k in ks], w, label=met.title() if met != "f1" else "F1", color=col)
        ax.set_xticks(range(len(ks))); ax.set_xticklabels([names[k] for k in ks]); ax.set_ylim(0, 1.0)
        ax.legend(frameon=False, fontsize=6.5, ncol=3, loc="lower center", bbox_to_anchor=(0.5, 1.0)); ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout(); fig.savefig(OUT / "fig_anomaly.png"); plt.close(fig)
    if "qa" in R:
        q = R["qa"]
        vs = list(q)
        fig, ax = plt.subplots(figsize=(3.4, 2.2))
        w = 0.26
        for j, (met, col, lab) in enumerate([("accuracy", "#6d4aff", "Answer acc."), ("claim_precision", "#22d3ee", "Claim precision"),
                                             ("fully_verified_rate", "#f472b6", "Fully grounded")]):
            ax.bar([i + (j - 1) * w for i in range(len(vs))], [q[v][met] for v in vs], w, label=lab, color=col)
        ax.set_xticks(range(len(vs))); ax.set_xticklabels(["Context\nstuffing", "Text-to-\nAnalytics", "Text-to-Analytics\n+ Verifier"], fontsize=7.5)
        ax.set_ylim(0, 1.0); ax.legend(frameon=False, fontsize=6.5, ncol=3, loc="lower center", bbox_to_anchor=(0.5, 1.0)); ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout(); fig.savefig(OUT / "fig_qa.png"); plt.close(fig)


def tables(R: dict) -> str:
    md = [f"# FinWise evaluation results\n\nProvider: {R.get('provider')}\n"]
    if "dataset" in R:
        md.append(f"Dataset: {R['dataset']}\n")
    if "categorisation" in R:
        md.append("## E1 Categorisation\n| Mode | Acc | Macro-F1 | LLM calls | Tokens | Txns via LLM | Time (s) |\n|---|---|---|---|---|---|---|")
        for m, r in R["categorisation"].items():
            md.append(f"| {m} | {r['accuracy']:.3f} | {r['macro_f1']:.3f} | {r['llm_calls']} | {r['prompt_tokens'] + r['completion_tokens']} | "
                      f"{r['txns_labelled_by_llm']} | {r['seconds']} |")
    for key in ("anomaly_true_categories", "anomaly_pred_categories"):
        if key in R:
            md.append(f"\n## E2 Anomaly detection ({key})\n| Method | TP | FP | FN | P | R | F1 |\n|---|---|---|---|---|---|---|")
            for m, r in R[key].items():
                md.append(f"| {m} | {r['tp']} | {r['fp']} | {r['fn']} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |")
    if "anomaly_ablation" in R:
        md.append("\n## E2b Detector ablation (component removed)\n| Removed | TP | FP | FN | P | R | F1 |\n|---|---|---|---|---|---|---|")
        for m, r in R["anomaly_ablation"].items():
            md.append(f"| {m} | {r['tp']} | {r['fp']} | {r['fn']} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |")
    if "qa" in R:
        md.append("\n## E3/E4 QA correctness and faithfulness\n| Variant | N | Answer acc | Claim precision | Mean GFS | Fully grounded | Avg tokens | Avg latency (s) |\n|---|---|---|---|---|---|---|---|")
        for v, r in R["qa"].items():
            md.append(f"| {v} | {r['n']} | {r['accuracy']:.3f} | {r['claim_precision']:.3f} | {r['mean_gfs']:.3f} | "
                      f"{r['fully_verified_rate']:.3f} | {r['avg_tokens']} | {r['avg_latency_s']} |")
    return "\n".join(md) + "\n"


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--qa-limit", type=int, default=None, help="questions per persona")
    args = ap.parse_args()
    db.init()
    dfs = {p: load(p) for p in PERSONAS}
    n = sum(len(d) for d in dfs.values())
    R: dict = {"provider": llm.info(), "dataset": f"{n} transactions, 3 personas, 3 months, "
                                                  f"{sum(int(d['true_anomaly'].sum()) for d in dfs.values())} planted anomalies"}
    online = llm.available and not args.offline
    R["categorisation"] = await exp_categorisation(dfs, ["rules", "llm", "hybrid"] if online else ["rules"])
    R["anomaly_true_categories"] = exp_anomaly(dfs, "true_category")
    R["anomaly_ablation"] = exp_ablation(dfs)
    if online:
        R["anomaly_pred_categories"] = exp_anomaly(dfs, "pred_hybrid")
        R["qa"] = await exp_qa(dfs, args.qa_limit)
    (OUT / "results.json").write_text(json.dumps(R, indent=1, default=str))
    (OUT / "tables.md").write_text(tables(R))
    figures(R)
    print(tables(R))


if __name__ == "__main__":
    if "--figures-only" in sys.argv:
        figures(json.loads((OUT / "results.json").read_text()))
    else:
        sys.exit(asyncio.run(main()))
