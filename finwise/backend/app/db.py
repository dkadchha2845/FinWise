"""SQLite persistence (stdlib sqlite3, one file)."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pandas as pd

DB_PATH = Path(os.getenv("FINWISE_DB", Path(__file__).resolve().parents[1] / "finwise.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  n_txns INTEGER, period_start TEXT, period_end TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, statement_id INTEGER, date TEXT, description TEXT, masked TEXT,
  merchant TEXT, amount REAL, direction TEXT, category TEXT, category_source TEXT,
  is_anomaly INTEGER DEFAULT 0, anomaly_type TEXT, anomaly_score REAL, anomaly_reason TEXT,
  explanation TEXT, suggestion TEXT
);
CREATE INDEX IF NOT EXISTS ix_tx_stmt ON transactions(statement_id);
CREATE TABLE IF NOT EXISTS merchant_cache (merchant TEXT, direction TEXT, category TEXT, source TEXT,
  PRIMARY KEY (merchant, direction));
CREATE TABLE IF NOT EXISTS llm_cache (key TEXT PRIMARY KEY, value TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
"""


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init():
    with conn() as c:
        c.executescript(SCHEMA)


def get_setting(key: str, default=None):
    with conn() as c:
        r = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def set_setting(key: str, value):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (key, json.dumps(value)))


def cache_get(key: str):
    with conn() as c:
        r = c.execute("SELECT value FROM llm_cache WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None


def cache_put(key: str, value: str):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO llm_cache(key, value) VALUES (?, ?)", (key, value))


def merchant_cache_get(pairs: list[tuple[str, str]]) -> dict[tuple[str, str], tuple[str, str]]:
    out = {}
    with conn() as c:
        for m, d in set(pairs):
            r = c.execute("SELECT category, source FROM merchant_cache WHERE merchant=? AND direction=?", (m, d)).fetchone()
            if r:
                out[(m, d)] = (r["category"], r["source"])
    return out


def merchant_cache_put(items: list[tuple[str, str, str, str]]):
    with conn() as c:
        c.executemany("INSERT OR REPLACE INTO merchant_cache(merchant, direction, category, source) VALUES (?,?,?,?)", items)


def save_statement(filename: str, df: pd.DataFrame) -> int:
    with conn() as c:
        cur = c.execute("INSERT INTO statements(filename, n_txns, period_start, period_end) VALUES (?,?,?,?)",
                        (filename, len(df), df["date"].min().strftime("%Y-%m-%d"), df["date"].max().strftime("%Y-%m-%d")))
        sid = cur.lastrowid
        rows = [(sid, r.date.strftime("%Y-%m-%d"), r.description, r.masked, r.merchant, float(r.amount), r.direction,
                 r.category, r.category_source) for r in df.itertuples()]
        c.executemany("INSERT INTO transactions(statement_id, date, description, masked, merchant, amount, direction,"
                      " category, category_source) VALUES (?,?,?,?,?,?,?,?,?)", rows)
    return sid


def list_statements():
    with conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM statements ORDER BY id DESC").fetchall()]


def delete_statement(sid: int):
    with conn() as c:
        c.execute("DELETE FROM transactions WHERE statement_id=?", (sid,))
        c.execute("DELETE FROM statements WHERE id=?", (sid,))


def load_df(sid: int) -> pd.DataFrame:
    with conn() as c:
        df = pd.read_sql_query("SELECT * FROM transactions WHERE statement_id=? ORDER BY date, id", c, params=(sid,))
    df["date"] = pd.to_datetime(df["date"])
    return df


def update_anomalies(df: pd.DataFrame):
    with conn() as c:
        c.executemany("UPDATE transactions SET is_anomaly=?, anomaly_type=?, anomaly_score=?, anomaly_reason=? WHERE id=?",
                      [(int(r.is_anomaly), r.anomaly_type, float(r.anomaly_score), r.anomaly_reason, int(r.id))
                       for r in df.itertuples()])


def update_explanations(items: list[tuple[str, str, int]]):
    with conn() as c:
        c.executemany("UPDATE transactions SET explanation=?, suggestion=? WHERE id=?", items)


def update_category(tid: int, category: str):
    with conn() as c:
        r = c.execute("SELECT merchant, direction, statement_id FROM transactions WHERE id=?", (tid,)).fetchone()
        if not r:
            return None
        c.execute("UPDATE transactions SET category=?, category_source='user' WHERE merchant=? AND direction=? "
                  "AND statement_id=?", (category, r["merchant"], r["direction"], r["statement_id"]))
        c.execute("INSERT OR REPLACE INTO merchant_cache(merchant, direction, category, source) VALUES (?,?,?,'user')",
                  (r["merchant"], r["direction"], category))
        return r["statement_id"]
