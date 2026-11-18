"""Statement parsing: CSV / XLSX / PDF -> normalised DataFrame.

Normalised columns: date (datetime64), description (str), amount (float > 0), direction ('debit'|'credit')
"""
from __future__ import annotations

import io
import re

import pandas as pd

DATE_KEYS = ["txn date", "transaction date", "date", "value date", "posting date", "value dt", "tran date"]
DESC_KEYS = ["narration", "description", "particulars", "details", "remarks", "transaction details", "transaction remarks"]
DEBIT_KEYS = ["withdrawal amt.", "withdrawal amt", "withdrawal", "debit", "debit amount", "dr amount", "withdrawals", "dr"]
CREDIT_KEYS = ["deposit amt.", "deposit amt", "deposit", "credit", "credit amount", "cr amount", "deposits", "cr"]
AMOUNT_KEYS = ["amount", "amt", "transaction amount", "txn amount", "amount (inr)", "amount(inr)"]
TYPE_KEYS = ["dr/cr", "cr/dr", "type", "txn type", "debit/credit", "transaction type"]


class ParseError(ValueError):
    pass


def _find(cols: list[str], keys: list[str]) -> str | None:
    low = {c: str(c).strip().lower() for c in cols}
    for k in keys:  # exact match first, in priority order
        for c, l in low.items():
            if l == k:
                return c
    for k in keys:
        if len(k) <= 2:
            continue
        for c, l in low.items():
            if k in l:
                return c
    return None


def _num(s) -> float:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return float("nan")
    if isinstance(s, (int, float)):
        return float(s)
    t = str(s).strip().replace(",", "").replace("₹", "").replace("INR", "").strip()
    if t in {"", "-", "nan", "None"}:
        return float("nan")
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()")
    m = re.search(r"-?\d+(\.\d+)?", t)
    if not m:
        return float("nan")
    v = float(m.group())
    return -v if neg else v


def _header_row(df: pd.DataFrame) -> pd.DataFrame:
    """Some exports have banner rows above the real header: locate it."""
    if _find(list(df.columns), DATE_KEYS) and _find(list(df.columns), DESC_KEYS):
        return df
    for i in range(min(25, len(df))):
        row = [str(x) for x in df.iloc[i].tolist()]
        if _find(row, DATE_KEYS) and _find(row, DESC_KEYS):
            new = df.iloc[i + 1:].copy()
            new.columns = row
            return new
    return df


def normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = _header_row(df)
    df = df.dropna(how="all")
    cols = list(df.columns)
    c_date, c_desc = _find(cols, DATE_KEYS), _find(cols, DESC_KEYS)
    if not c_date or not c_desc:
        raise ParseError(f"Could not find date/description columns in: {cols}")
    c_dr, c_cr = _find(cols, DEBIT_KEYS), _find(cols, CREDIT_KEYS)
    c_amt, c_type = _find(cols, AMOUNT_KEYS), _find(cols, TYPE_KEYS)

    out = pd.DataFrame()
    out["date"] = pd.to_datetime(df[c_date].astype(str).str.strip(), dayfirst=True, errors="coerce", format="mixed")
    out["description"] = df[c_desc].astype(str).str.strip()

    if c_dr and c_cr and c_dr != c_cr:
        dr = df[c_dr].map(_num).fillna(0).abs()
        cr = df[c_cr].map(_num).fillna(0).abs()
        out["amount"] = dr.where(dr > 0, cr)
        out["direction"] = ["debit" if d > 0 else "credit" for d in dr]
    elif c_amt:
        amt = df[c_amt].map(_num)
        if c_type:
            typ = df[c_type].astype(str).str.lower()
            out["direction"] = ["credit" if t.startswith("c") else "debit" for t in typ]
        else:
            out["direction"] = ["credit" if a > 0 else "debit" for a in amt.fillna(0)]
        out["amount"] = amt.abs()
    else:
        raise ParseError("Could not find amount / debit / credit columns")

    out = out.dropna(subset=["date", "amount"])
    out = out[(out["amount"] > 0) & (out["description"].str.len() > 0) & (out["description"] != "nan")]
    out = out.sort_values("date", kind="stable").reset_index(drop=True)
    if out.empty:
        raise ParseError("No transactions found in file")
    return out


def _parse_pdf(data: bytes) -> pd.DataFrame:
    import pdfplumber

    frames, header = [], None
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table:
                    continue
                rows = [[(c or "").replace("\n", " ").strip() for c in r] for r in table]
                if _find(rows[0], DATE_KEYS) and _find(rows[0], DESC_KEYS):
                    header, rows = rows[0], rows[1:]
                if header and rows:
                    frames.append(pd.DataFrame([r[: len(header)] for r in rows], columns=header))
    if frames:
        return pd.concat(frames, ignore_index=True)

    # Fallback: line-based text parsing  (e.g. "05-10-2026 UPI/DR/... 1,234.00 Dr 45,000.00")
    rx = re.compile(r"^(\d{1,2}[-/][\d\w]{2,3}[-/]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr|DR|CR)?\b")
    recs = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                m = rx.match(line.strip())
                if m:
                    recs.append({"Date": m.group(1), "Description": m.group(2), "Amount": m.group(3),
                                 "Type": m.group(4) or "Dr"})
    if not recs:
        raise ParseError("No transaction table found in PDF (scanned PDFs are not supported)")
    return pd.DataFrame(recs)


def parse_file(filename: str, data: bytes) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv") or name.endswith(".txt"):
        raw = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, on_bad_lines="skip")
    elif name.endswith((".xlsx", ".xls")):
        raw = pd.read_excel(io.BytesIO(data), dtype=str)
    elif name.endswith(".pdf"):
        raw = _parse_pdf(data)
    else:
        raise ParseError("Unsupported file type. Upload CSV, XLSX or PDF.")
    return normalise(raw)
