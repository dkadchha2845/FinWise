"""FinWise API."""
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import analytics as A
from . import db
from .categories import CATEGORIES
from .categorize import categorize, prepare
from .chat import answer_stream
from .ingest import ParseError, parse_file
from .insights import explain_anomalies, generate_insights, health_rationale
from .llm import STATS, llm

SAMPLES = Path(__file__).resolve().parents[1] / "data" / "samples"
SAMPLE_FILES = {"aarav": "aarav_statement.csv", "priya": "priya_statement.xlsx", "rohan": "rohan_statement.pdf"}

app = FastAPI(title="FinWise API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
db.init()
_insight_cache: dict[int, dict] = {}


def active_id() -> int:
    sid = db.get_setting("active_statement")
    if not sid:
        raise HTTPException(404, "No statement uploaded yet")
    return int(sid)


def active_df():
    df = db.load_df(active_id())
    if df.empty:
        raise HTTPException(404, "Active statement has no transactions")
    return df


async def ingest(filename: str, data: bytes) -> dict:
    t0 = time.perf_counter()
    steps = []
    try:
        df = parse_file(filename, data)
    except ParseError as e:
        raise HTTPException(422, str(e))
    steps.append({"step": "Parsed statement", "detail": f"{len(df)} transactions"})
    df = prepare(df)
    steps.append({"step": "Masked personal data", "detail": "account refs, UPI IDs, phone numbers, person names"})
    calls0 = STATS.calls
    df = await categorize(df)
    src = df["category_source"].value_counts().to_dict()
    steps.append({"step": "Categorised", "detail": f"{src.get('rule', 0)} by rules, {src.get('llm', 0)} by AI, "
                                                   f"{src.get('user', 0) + src.get('cache', 0)} from memory, "
                                                   f"{src.get('heuristic', 0)} fallback"})
    sid = db.save_statement(filename, df)
    full = A.detect_anomalies(db.load_df(sid))
    db.update_anomalies(full)
    n_anom = int(full["is_anomaly"].sum())
    steps.append({"step": "Detected unusual expenses", "detail": f"{n_anom} flagged"})
    db.set_setting("active_statement", sid)
    _insight_cache.pop(sid, None)
    return {"statement_id": sid, "filename": filename, "transactions": len(df), "anomalies": n_anom,
            "category_sources": src, "llm_calls": STATS.calls - calls0, "seconds": round(time.perf_counter() - t0, 2),
            "steps": steps}


@app.get("/api/status")
def status():
    sid = db.get_setting("active_statement")
    return {"llm": llm.info(), "active_statement": sid, "user_name": db.get_setting("user_name", "Aarav"),
            "categories": CATEGORIES, "samples": list(SAMPLE_FILES)}


class SettingsIn(BaseModel):
    user_name: str | None = None


@app.post("/api/settings")
def save_settings(s: SettingsIn):
    if s.user_name is not None:
        db.set_setting("user_name", s.user_name.strip()[:40] or "Aarav")
    llm.reload()
    return status()


@app.post("/api/statements/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (10 MB max)")
    return await ingest(file.filename or "statement.csv", data)


@app.post("/api/statements/sample/{name}")
async def load_sample(name: str):
    if name not in SAMPLE_FILES:
        raise HTTPException(404, "Unknown sample")
    p = SAMPLES / SAMPLE_FILES[name]
    return await ingest(p.name, p.read_bytes())


@app.get("/api/statements")
def statements():
    return {"active": db.get_setting("active_statement"), "items": db.list_statements()}


@app.post("/api/statements/{sid}/activate")
def activate(sid: int):
    db.set_setting("active_statement", sid)
    return {"active": sid}


@app.delete("/api/statements/{sid}")
def delete(sid: int):
    db.delete_statement(sid)
    if db.get_setting("active_statement") == sid:
        items = db.list_statements()
        db.set_setting("active_statement", items[0]["id"] if items else None)
    _insight_cache.pop(sid, None)
    return {"ok": True}


@app.get("/api/dashboard")
async def dashboard():
    df = active_df()
    ms = A.months(df)
    recent = df.sort_values(["date", "id"], ascending=False).head(8)
    return {
        "months": ms,
        "overview": A.overview(df),
        "latest": A.overview(df, ms[-1]),
        "trend": A.monthly_trend(df),
        "health": {**A.health_score(df), "rationale": await health_rationale(df)},
        "anomalies": A.anomalies(df),
        "subscriptions": A.subscriptions(df),
        "upcoming": A.upcoming_bills(df),
        "recent": [{"id": int(r.id), "date": r.date.strftime("%d %b"), "merchant": r.merchant, "category": r.category,
                    "amount": A.r2(r.amount), "direction": r.direction} for r in recent.itertuples()],
    }


@app.get("/api/transactions")
def transactions(q: str | None = None, category: str | None = None, month: str | None = None,
                 anomalies_only: bool = False, sort: str = "date_desc", page: int = 1, size: int = 25):
    df = active_df()
    if month:
        df = A.filt(df, month)
    if category:
        df = df[df["category"] == category]
    if q:
        ql = q.lower()
        df = df[df["merchant"].str.lower().str.contains(ql, regex=False) |
                df["description"].str.lower().str.contains(ql, regex=False)]
    if anomalies_only:
        df = df[df["is_anomaly"] == 1]
    key, asc = {"date_desc": ("date", False), "date_asc": ("date", True), "amount_desc": ("amount", False),
                "amount_asc": ("amount", True)}.get(sort, ("date", False))
    df = df.sort_values([key, "id"], ascending=[asc, asc])
    total = len(df)
    page_df = df.iloc[(page - 1) * size: page * size]
    return {"total": total, "page": page, "size": size,
            "items": [{"id": int(r.id), "date": r.date.strftime("%Y-%m-%d"), "description": r.description,
                       "merchant": r.merchant, "category": r.category, "source": r.category_source,
                       "amount": A.r2(r.amount), "direction": r.direction, "is_anomaly": bool(r.is_anomaly),
                       "anomaly_reason": r.anomaly_reason} for r in page_df.itertuples()]}


class CategoryIn(BaseModel):
    category: str


@app.patch("/api/transactions/{tid}")
def recategorize(tid: int, body: CategoryIn):
    if body.category not in CATEGORIES:
        raise HTTPException(422, "Unknown category")
    sid = db.update_category(tid, body.category)
    if sid is None:
        raise HTTPException(404, "Transaction not found")
    full = A.detect_anomalies(db.load_df(sid))
    db.update_anomalies(full)
    _insight_cache.pop(sid, None)
    return {"ok": True}


@app.get("/api/anomalies")
async def anomalies():
    df = active_df()
    return {"items": await explain_anomalies(df)}


@app.get("/api/insights")
async def insights(refresh: bool = False):
    sid = active_id()
    df = active_df()
    if refresh or sid not in _insight_cache:
        _insight_cache[sid] = await generate_insights(df)
    return {
        **_insight_cache[sid],
        "patterns": {"weekday_weekend": A.weekday_weekend(df), "recurring": A.recurring(df),
                     "subscriptions": A.subscriptions(df), "top_merchants": A.top_merchants(df, 6),
                     "month_over_month": A.mom_change(df)},
        "budget": A.budget_suggestion(df),
    }


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []


@app.post("/api/chat")
async def chat(body: ChatIn):
    df = active_df()

    async def gen():
        try:
            async for ev in answer_stream(df, body.message[:1000], body.history[-6:]):
                yield f"data: {json.dumps(ev, default=str)}\n\n"
        except Exception as e:  # surface errors to the UI instead of a broken stream
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:200]})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
