"""Numeric Claim Verifier: checks every amount / percentage / ratio in LLM output against computed facts.

Grounded Faithfulness Score (GFS) = supported numeric claims / total numeric claims  (1.0 if no claims).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

AMOUNT_RX = re.compile(
    r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lakhs|lac|l|k|thousand|cr|crore)?\b"
    r"|\b([\d,]*\d(?:\.\d+)?)\s*(lakh|lakhs|lac|k|thousand)\b", re.I)
PCT_RX = re.compile(r"(-?\d+(?:\.\d+)?)\s*(?:%|percent\b)", re.I)
MULT_RX = re.compile(r"(\d+(?:\.\d+)?)\s*(?:x\b|×|times\b)", re.I)
BIGNUM_RX = re.compile(r"(?<![\w.₹])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d{4,}(?:\.\d+)?)(?![\d%])")
DATE_RX = re.compile(
    r"\b\d{4}-\d{2}(?:-\d{2})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b"
    r"|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b"
    r"|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b"
    r"|\b20[2-3]\d\b", re.I)
SCALE = {"lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "l": 1e5, "k": 1e3, "thousand": 1e3, "cr": 1e7, "crore": 1e7}


@dataclass
class Claim:
    text: str
    value: float
    kind: str  # amount | percent | ratio
    tol: float = 0.0  # extra tolerance for rounded paraphrases such as "₹1.2 lakh" or "18k"
    supported: bool = False


@dataclass
class Report:
    claims: list[Claim] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.claims)

    @property
    def supported(self) -> int:
        return sum(c.supported for c in self.claims)

    @property
    def gfs(self) -> float:
        return 1.0 if not self.claims else self.supported / self.total

    @property
    def unsupported(self) -> list[str]:
        return [c.text for c in self.claims if not c.supported]

    def as_dict(self) -> dict:
        return {"verified": self.supported == self.total, "claims": self.total, "supported": self.supported,
                "gfs": round(self.gfs, 3), "unsupported": self.unsupported}


def _f(s: str) -> float:
    return float(s.replace(",", ""))


def extract_claims(text: str) -> list[Claim]:
    t = DATE_RX.sub(" ", text)
    claims: list[Claim] = []
    spans: list[tuple[int, int]] = []
    for m in AMOUNT_RX.finditer(t):
        num, unit = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        try:
            scale = SCALE.get((unit or "").lower(), 1)
            v = _f(num) * scale
        except ValueError:
            continue
        decimals = len(num.split(".")[1]) if "." in num else 0
        tol = 0.5 * scale * 10 ** -decimals if scale > 1 else 0.0
        claims.append(Claim(m.group().strip().rstrip(",."), v, "amount", tol))
        spans.append(m.span())
    for m in PCT_RX.finditer(t):
        claims.append(Claim(m.group().strip(), float(m.group(1)), "percent"))
        spans.append(m.span())
    for m in MULT_RX.finditer(t):
        claims.append(Claim(m.group().strip(), float(m.group(1)), "ratio"))
        spans.append(m.span())
    for m in BIGNUM_RX.finditer(t):
        if any(s <= m.start() < e for s, e in spans):
            continue
        claims.append(Claim(m.group().strip(), _f(m.group(1)), "amount"))
    return claims


def fact_numbers(obj, out: set[float] | None = None) -> set[float]:
    """Collect every number appearing in a (nested) fact structure, including numbers inside strings."""
    out = set() if out is None else out
    if isinstance(obj, bool):
        return out
    if isinstance(obj, (int, float)):
        out.add(float(obj))
    elif isinstance(obj, str):
        for m in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", obj):
            try:
                out.add(_f(m.group()))
            except ValueError:
                pass
    elif isinstance(obj, dict):
        for v in obj.values():
            fact_numbers(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            fact_numbers(v, out)
    return out


def _derived(facts: set[float]) -> set[float]:
    """Allowed paraphrases: absolute values, sums/differences of pairs are NOT allowed (must be computed by tools)."""
    d = set()
    for v in facts:
        d.update({v, abs(v)})
        if 0 < abs(v) <= 1:
            d.add(abs(v) * 100)  # ratio expressed as percent
    return d


def _match(claim: Claim, allowed: set[float]) -> bool:
    v = abs(claim.value)
    for f in allowed:
        if claim.kind == "amount":
            tol = max(1.0, 0.01 * f, claim.tol)
        elif claim.kind == "percent":
            tol = max(0.6, 0.02 * f)
        else:
            tol = max(0.15, 0.03 * f)
        if abs(v - f) <= tol:
            return True
    return False


def verify(text: str, facts) -> Report:
    allowed = _derived(fact_numbers(facts))
    claims = extract_claims(text)
    for c in claims:
        c.supported = _match(c, allowed)
    return Report(claims)
