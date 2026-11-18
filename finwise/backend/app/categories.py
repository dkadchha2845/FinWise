"""Category taxonomy, rule dictionary and merchant extraction."""
from __future__ import annotations

import re

CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transport",
    "Shopping",
    "Bills & Utilities",
    "Subscriptions",
    "Entertainment",
    "Rent & Housing",
    "Health",
    "Education",
    "EMI & Loans",
    "Transfers",
    "Cash Withdrawal",
    "Income",
    "Other",
]

# Categories counted as "essential" for the health score.
ESSENTIAL = {"Groceries", "Transport", "Bills & Utilities", "Rent & Housing", "Health", "Education", "EMI & Loans"}
# Excluded from "spending" analytics (money moved, not consumed).
NON_SPEND = {"Transfers", "Income"}

# Deliberately limited to well-known Indian merchants: the long tail is left to the LLM.
RULES: list[tuple[str, str]] = [
    (r"salary|interest credit|int\.pd|refund|cashback|dividend", "Income"),
    (r"swiggy|zomato|dominos|mcdonald|kfc|starbucks|eatsure", "Food & Dining"),
    (r"bigbasket|blinkit|zepto|dmart|jiomart|instamart|grofers", "Groceries"),
    (r"uber|\bola\b|olacabs|rapido|irctc|indigo|metro|redbus|hpcl|iocl|indian oil|bharat petroleum|fastag", "Transport"),
    (r"amazon(?!.*prime)|flipkart|myntra|ajio|nykaa|meesho", "Shopping"),
    (r"airtel|jio(?!mart)|\bvi\b|vodafone|bescom|electricity|tata power|adani elec|mahanagar gas|broadband|act fibernet|bsnl|water bill", "Bills & Utilities"),
    (r"netflix|spotify|hotstar|prime video|amazon prime|youtube|google play|apple\.com", "Subscriptions"),
    (r"bookmyshow|\bpvr\b|inox|steam", "Entertainment"),
    (r"\brent\b|nobroker|maintenance", "Rent & Housing"),
    (r"apollo|pharmeasy|1mg|netmeds|hospital", "Health"),
    (r"udemy|coursera|byju|unacademy|college fee|school fee", "Education"),
    (r"\bemi\b|bajaj fin|loan|hdfc credila", "EMI & Loans"),
    (r"atm wdl|atm cash|cash withdrawal|\batm\b", "Cash Withdrawal"),
]

_COMPILED = [(re.compile(p, re.I), c) for p, c in RULES]


def rule_category(description: str, direction: str) -> str | None:
    """Return a category from the rule dictionary, or None if no rule matches."""
    for rx, cat in _COMPILED:
        if rx.search(description):
            if cat == "Income" and direction != "credit":
                continue
            return cat
    if direction == "credit" and re.search(r"neft|imps|upi", description, re.I):
        return None  # could be income or a transfer in: let the LLM decide
    return None


_NOISE = re.compile(r"\b(pvt|ltd|private|limited|india|payment|payments|online|services|technologies|retail|ref|txn|"
                    r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", re.I)


def extract_merchant(description: str) -> str:
    """Pull a clean merchant/payee name out of a raw bank narration."""
    d = description.strip()
    parts = [p.strip() for p in re.split(r"[/|]", d) if p.strip()]
    head = parts[0].upper() if parts else ""
    name = ""
    if head.startswith("UPI") and len(parts) >= 4:
        name = parts[3]
    elif head in {"NEFT", "IMPS", "RTGS"} and len(parts) >= 3:
        name = parts[2]
    elif head in {"ACH", "NACH", "ECS"} and len(parts) >= 2:
        name = parts[1]
    elif re.match(r"^POS\b", d, re.I):
        name = re.sub(r"^POS\s+\d+\s+", "", d, flags=re.I)
        name = re.sub(r"\s+(MUMBAI|BANGALORE|BENGALURU|DELHI|PUNE|HYDERABAD|CHENNAI|NOIDA|GURGAON|AHMEDABAD)\b.*$", "", name, flags=re.I)
    elif re.match(r"^ATM", d, re.I):
        return "ATM Withdrawal"
    elif re.match(r"^SALARY", d, re.I):
        name = re.sub(r"^SALARY\s+(CREDIT\s+)?", "", d, flags=re.I) or "Salary"
    else:
        name = d
    name = re.sub(r"[@].*$", "", name)
    name = re.sub(r"\d{4,}", "", name)
    name = _NOISE.sub("", name)
    name = re.sub(r"[^A-Za-z0-9&.' ]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name.title() if name else "Unknown"
