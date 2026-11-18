"""Generate synthetic, labelled Indian (INR / UPI-style) bank statements.

Outputs (in data/):
  samples/aarav_statement.csv   HDFC-style CSV
  samples/priya_statement.xlsx  Excel export
  samples/rohan_statement.pdf   PDF statement with a ruled table
  labels/<persona>.json         ground-truth category + anomaly flag per row

Run:  python scripts/generate_data.py
"""
from __future__ import annotations

import csv
import json
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_S = ROOT / "data" / "samples"
OUT_L = ROOT / "data" / "labels"
MONTHS = [(2026, 8), (2026, 9), (2026, 10)]
BANKS = ["okaxis", "oksbi", "okhdfcbank", "ybl", "paytm", "ibl", "okicici"]
CITIES = ["BANGALORE", "MUMBAI", "PUNE", "DELHI", "HYDERABAD"]


@dataclass
class Txn:
    d: date
    desc: str
    amount: float
    direction: str  # debit / credit
    category: str
    anomaly: str = ""  # "", spike, duplicate, new_merchant


@dataclass
class Gen:
    rng: random.Random
    txns: list[Txn] = field(default_factory=list)

    def ref(self, n: int = 12) -> str:
        return "".join(self.rng.choice("0123456789") for _ in range(n))

    def upi(self, m: str, note: str = "Payment", cr: bool = False) -> str:
        return f"UPI/{'CR' if cr else 'DR'}/{self.ref()}/{m}/{self.rng.choice(BANKS)}/{note}"

    def pos(self, m: str) -> str:
        return f"POS {self.ref(16)} {m} {self.rng.choice(CITIES)}"

    def neft(self, m: str, note: str) -> str:
        return f"NEFT/N{self.ref(10)}/{m}/{note}"

    def ach(self, m: str) -> str:
        return f"ACH/{m}/{self.ref(10)}"

    def add(self, d, desc, amt, cat, direction="debit", anomaly=""):
        self.txns.append(Txn(d, desc, round(float(amt), 2), direction, cat, anomaly))

    def day(self, y, m, lo=1, hi=28) -> date:
        return date(y, m, self.rng.randint(lo, hi))

    def spend(self, y, m, n, pool, lo, hi, cat, fmt="upi", whole=True):
        for _ in range(n):
            name = self.rng.choice(pool)
            amt = self.rng.uniform(lo, hi)
            amt = round(amt) if whole else round(amt, 2)
            desc = self.pos(name) if fmt == "pos" else self.upi(name)
            self.add(self.day(y, m), desc, amt, cat)


# Merchant pools: "known" ones are in the rule dictionary, "long-tail" ones are not.
FOOD = ["SWIGGY", "ZOMATO", "DOMINOS PIZZA", "STARBUCKS"]
FOOD_LT = ["SHARMA DHABA", "CHAI POINT", "THIRD WAVE COFFEE", "MEGHANA FOODS", "HALDIRAMS", "BIRYANI BLUES", "TRUFFLES CAFE"]
GROC = ["BLINKIT", "ZEPTO", "BIGBASKET", "DMART"]
GROC_LT = ["SRI BALAJI STORES", "NATURES BASKET", "MORE SUPERMARKET", "FRESH PICK MART"]
RIDES = ["UBER INDIA", "OLA CABS", "RAPIDO", "NAMMA METRO"]
RIDES_LT = ["YULU BIKES", "BLUSMART MOBILITY", "QUICKRIDE"]
SHOP = ["AMAZON SELLER SERVICES", "FLIPKART", "MYNTRA", "AJIO", "NYKAA"]
SHOP_LT = ["DECATHLON SPORTS", "LIFESTYLE STORES", "IKEA", "LENSKART", "BEWAKOOF BRANDS"]
ENT = ["BOOKMYSHOW", "PVR CINEMAS"]
ENT_LT = ["WONDERLA PARKS", "TIMEZONE GAMING", "SMAAAASH"]
HEALTH = ["APOLLO PHARMACY", "PHARMEASY", "TATA 1MG"]
HEALTH_LT = ["DR MEHTA CLINIC", "PRACTO", "THYROCARE"]
FRIENDS = ["ROHIT VERMA", "SNEHA PATIL", "ANKIT SHARMA", "KAVYA NAIR", "ARJUN REDDY"]


def persona_aarav(g: Gen):
    for i, (y, m) in enumerate(MONTHS):
        mon = date(y, m, 1).strftime("%b").upper()
        g.add(date(y, m, 1), f"SALARY CREDIT ACME TECHNOLOGIES {mon}", 90000, "Income", "credit")
        g.add(date(y, m, 3), g.neft("RAMESH KUMAR", f"RENT {mon}"), 16000, "Rent & Housing")
        g.add(date(y, m, 5), g.ach("BAJAJ FINANCE LTD"), 3499, "EMI & Loans")
        g.add(date(y, m, 7), g.upi("AIRTEL POSTPAID", "Bill"), 599, "Bills & Utilities")
        g.add(date(y, m, 9), g.upi("BESCOM ELECTRICITY", "Bill"), g.rng.randint(1100, 1600) if i < 2 else 4860,
              "Bills & Utilities", anomaly="" if i < 2 else "spike")
        g.add(date(y, m, 10), g.upi("ACT FIBERNET", "Bill"), 1059, "Bills & Utilities")
        g.add(date(y, m, 2), g.upi("NETFLIX", "Subscription"), 649, "Subscriptions")
        g.add(date(y, m, 12), g.upi("SPOTIFY", "Subscription"), 119, "Subscriptions")
        g.add(date(y, m, 14), g.upi("YOUTUBE PREMIUM", "Subscription"), 129, "Subscriptions")
        g.add(date(y, m, 18), g.pos("OPENAI CHATGPT"), 1999, "Subscriptions")
        g.spend(y, m, 18, FOOD, 140, 720, "Food & Dining")
        g.spend(y, m, 6, FOOD_LT, 120, 850, "Food & Dining")
        g.spend(y, m, 4, GROC, 250, 1600, "Groceries")
        g.spend(y, m, 2, GROC_LT, 180, 1200, "Groceries")
        g.spend(y, m, 12, RIDES, 70, 480, "Transport")
        g.spend(y, m, 3, RIDES_LT, 40, 260, "Transport")
        g.spend(y, m, 3, SHOP, 349, 3400, "Shopping")
        g.spend(y, m, 1, SHOP_LT, 499, 3800, "Shopping", fmt="pos")
        g.spend(y, m, 1, ENT, 300, 1100, "Entertainment")
        g.spend(y, m, 1, ENT_LT, 400, 1500, "Entertainment")
        g.spend(y, m, 1, HEALTH, 180, 900, "Health")
        if i == 1:
            g.add(g.day(y, m), g.pos("UDEMY"), 499, "Education")
            g.add(g.day(y, m), g.upi("DR MEHTA CLINIC"), 800, "Health")
        for _ in range(3):
            g.add(g.day(y, m), g.upi(g.rng.choice(FRIENDS), "Split"), g.rng.randint(200, 2500), "Transfers")
        g.add(g.day(y, m), g.upi(g.rng.choice(FRIENDS), "Split", cr=True), g.rng.randint(300, 1500), "Transfers", "credit")
        g.add(g.day(y, m), f"ATM WDL HDFC {g.rng.choice(CITIES)} {g.ref(6)}", g.rng.choice([2000, 3000, 5000]), "Cash Withdrawal")
    y, m = MONTHS[-1]
    g.add(date(y, m, 22), g.upi("SWIGGY", "Order"), 4250, "Food & Dining", anomaly="spike")
    g.add(date(y, m, 16), g.upi("AMAZON SELLER SERVICES", "Order"), 12999, "Shopping", anomaly="spike")
    g.add(date(y, m, 25), g.upi("UBER INDIA", "Ride"), 2380, "Transport", anomaly="spike")
    g.add(date(y, m, 2), g.upi("NETFLIX", "Subscription"), 649, "Subscriptions", anomaly="duplicate")
    g.add(date(y, m, 27), g.pos("CROMA RETAIL"), 18990, "Shopping", anomaly="new_merchant")
    g.add(date(y, m, 30), "INT.PD 01-07-2026 TO 30-09-2026", 412.0, "Income", "credit")


def persona_priya(g: Gen):
    for i, (y, m) in enumerate(MONTHS):
        mon = date(y, m, 1).strftime("%b").upper()
        g.add(date(y, m, 1), f"SALARY CREDIT GLOBEX FINSERV {mon}", 120000, "Income", "credit")
        g.add(date(y, m, 2), g.upi("NESTAWAY TECHNOLOGIES", "Monthly"), 28000, "Rent & Housing")
        g.add(date(y, m, 5), g.ach("HDB FINANCIAL SERVICES"), 12500, "EMI & Loans")
        g.add(date(y, m, 4), g.neft("SUNITA IYER", "MOM"), 10000, "Transfers")
        g.add(date(y, m, 8), g.upi("JIO POSTPAID", "Bill"), 699, "Bills & Utilities")
        g.add(date(y, m, 11), g.upi("TORRENT POWER", "Bill"), g.rng.randint(1400, 2100) if i < 2 else 6450,
              "Bills & Utilities", anomaly="" if i < 2 else "spike")
        g.add(date(y, m, 12), g.upi("INDANE GAS", "Cylinder"), 905, "Bills & Utilities")
        g.add(date(y, m, 6), g.upi("HOTSTAR", "Subscription"), 299, "Subscriptions")
        g.add(date(y, m, 15), g.upi("NETFLIX", "Subscription"), 649, "Subscriptions")
        g.add(date(y, m, 20), g.pos("CULTFIT"), 1499, "Subscriptions")
        g.add(date(y, m, 21), g.pos("LINKEDIN PREMIUM"), 1650, "Subscriptions")
        g.spend(y, m, 8, FOOD, 200, 900, "Food & Dining")
        g.spend(y, m, 5, FOOD_LT, 300, 1600, "Food & Dining", fmt="pos")
        g.spend(y, m, 7, GROC, 400, 2400, "Groceries")
        g.spend(y, m, 3, GROC_LT, 500, 2200, "Groceries", fmt="pos")
        g.spend(y, m, 2, ["SHELL FUEL STATION"], 1800, 2800, "Transport", fmt="pos")
        g.spend(y, m, 1, ["INDIAN OIL PETROL"], 1500, 2500, "Transport", fmt="pos")
        g.spend(y, m, 4, RIDES, 150, 600, "Transport")
        g.spend(y, m, 4, SHOP, 499, 4200, "Shopping")
        g.spend(y, m, 2, SHOP_LT, 899, 4500, "Shopping", fmt="pos")
        g.spend(y, m, 2, ENT, 400, 1600, "Entertainment")
        g.spend(y, m, 1, HEALTH, 300, 1400, "Health")
        g.spend(y, m, 1, HEALTH_LT, 500, 1800, "Health")
        if i == 0:
            g.add(g.day(y, m), g.pos("COURSERA"), 3999, "Education")
        for _ in range(2):
            g.add(g.day(y, m), g.upi(g.rng.choice(FRIENDS), "Split"), g.rng.randint(400, 3000), "Transfers")
    y, m = MONTHS[-1]
    z = g.rng.randint(380, 620)
    g.add(date(y, m, 19), g.upi("ZOMATO", "Order"), z, "Food & Dining")
    g.add(date(y, m, 19), g.upi("ZOMATO", "Order"), z, "Food & Dining", anomaly="duplicate")
    g.add(date(y, m, 24), g.upi("GOA BEACH RESORTS", "Booking"), 18500, "Entertainment", anomaly="new_merchant")
    g.add(date(y, m, 13), g.upi("MYNTRA", "Order"), 15800, "Shopping", anomaly="spike")
    g.add(date(y, m, 17), g.pos("APOLLO PHARMACY"), 9400, "Health", anomaly="spike")
    g.add(date(y, m, 9), "REFUND AMAZON ORDER 402-881", 1299, "Income", "credit")


def persona_rohan(g: Gen):
    for i, (y, m) in enumerate(MONTHS):
        mon = date(y, m, 1).strftime("%b").upper()
        for _ in range(g.rng.choice([1, 2])):
            g.add(g.day(y, m, 1, 20), g.neft("UPWORK ESCROW", "INVOICE"), g.rng.randint(32000, 58000), "Income", "credit")
        g.add(g.day(y, m, 10, 28), g.neft("RAZORPAY CLIENT PAYOUT", "PROJECT"), g.rng.randint(12000, 30000), "Income", "credit")
        g.add(date(y, m, 5), g.upi("SURESH NAIK", f"RENT {mon}"), 12000, "Rent & Housing")
        g.add(date(y, m, 9), g.upi("BESCOM ELECTRICITY", "Bill"), g.rng.randint(700, 1100), "Bills & Utilities")
        g.add(date(y, m, 10), g.upi("AIRTEL XSTREAM FIBER", "Bill"), 799, "Bills & Utilities")
        g.add(date(y, m, 3), g.upi("SPOTIFY", "Subscription"), 119, "Subscriptions")
        g.add(date(y, m, 8), g.pos("NOTION LABS"), 830, "Subscriptions")
        g.add(date(y, m, 18), g.pos("OPENAI CHATGPT"), 1999, "Subscriptions")
        g.add(date(y, m, 11), g.pos("ADOBE SYSTEMS"), 1675, "Subscriptions")
        g.spend(y, m, 12, FOOD, 120, 600, "Food & Dining")
        g.spend(y, m, 6, FOOD_LT, 90, 700, "Food & Dining")
        g.spend(y, m, 3, GROC, 200, 1300, "Groceries")
        g.spend(y, m, 2, GROC_LT, 150, 900, "Groceries")
        g.spend(y, m, 8, ["RAPIDO", "NAMMA METRO", "OLA CABS"], 40, 320, "Transport")
        g.spend(y, m, 3, RIDES_LT, 30, 180, "Transport")
        g.spend(y, m, 2, SHOP, 299, 2500, "Shopping")
        g.spend(y, m, 1, SHOP_LT, 399, 2900, "Shopping", fmt="pos")
        g.spend(y, m, 1, ENT_LT, 300, 1200, "Entertainment")
        g.spend(y, m, 1, HEALTH_LT, 300, 1100, "Health")
        if i == 2:
            g.add(g.day(y, m), g.pos("SIMPLILEARN"), 2499, "Education")
        for _ in range(2):
            g.add(g.day(y, m), g.upi(g.rng.choice(FRIENDS), "Split"), g.rng.randint(150, 1800), "Transfers")
        g.add(g.day(y, m), f"ATM WDL SBI {g.rng.choice(CITIES)} {g.ref(6)}", g.rng.choice([1000, 2000, 3000]), "Cash Withdrawal")
    y, m = MONTHS[-1]
    g.add(date(y, m, 11), g.pos("ADOBE SYSTEMS"), 1675, "Subscriptions", anomaly="duplicate")
    g.add(date(y, m, 14), g.upi("RAPIDO", "Ride"), 1850, "Transport", anomaly="spike")
    g.add(date(y, m, 21), g.upi("BLINKIT", "Order"), 3950, "Groceries", anomaly="spike")
    g.add(date(y, m, 26), g.upi("MAKEMYTRIP", "Booking"), 21450, "Transport", anomaly="new_merchant")


def finalize(g: Gen, opening: float) -> list[dict]:
    rows = sorted(g.txns, key=lambda t: (t.d, t.direction != "credit"))
    bal, out = opening, []
    for t in rows:
        bal += t.amount if t.direction == "credit" else -t.amount
        out.append({"date": t.d.isoformat(), "description": t.desc, "amount": t.amount, "direction": t.direction,
                    "balance": round(bal, 2), "category": t.category, "is_anomaly": bool(t.anomaly),
                    "anomaly_type": t.anomaly})
    return out


def write_csv(rows, path):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"])
        for i, r in enumerate(rows):
            d = date.fromisoformat(r["date"]).strftime("%d/%m/%y")
            wd = f"{r['amount']:.2f}" if r["direction"] == "debit" else ""
            dp = f"{r['amount']:.2f}" if r["direction"] == "credit" else ""
            w.writerow([d, r["description"], f"{i + 100000:012d}", d, wd, dp, f"{r['balance']:.2f}"])


def write_xlsx(rows, path):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Statement"
    ws.append(["Txn Date", "Description", "Debit", "Credit", "Balance"])
    for r in rows:
        d = date.fromisoformat(r["date"]).strftime("%d-%b-%Y")
        ws.append([d, r["description"], r["amount"] if r["direction"] == "debit" else None,
                   r["amount"] if r["direction"] == "credit" else None, r["balance"]])
    wb.save(path)


def write_pdf(rows, path, holder):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=28, rightMargin=28, topMargin=32, bottomMargin=32)
    data = [["Date", "Particulars", "Amount", "Dr/Cr", "Balance"]]
    for r in rows:
        data.append([date.fromisoformat(r["date"]).strftime("%d-%m-%Y"), r["description"], f"{r['amount']:,.2f}",
                     "Dr" if r["direction"] == "debit" else "Cr", f"{r['balance']:,.2f}"])
    t = Table(data, colWidths=[62, 290, 70, 34, 80], repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e1b4b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ]))
    doc.build([Paragraph(f"Account Statement — {holder}", styles["Title"]),
               Paragraph("State Bank (synthetic demo) · Savings A/c XXXXXX4821 · 01-08-2026 to 31-10-2026", styles["Normal"]),
               Spacer(1, 10), t])


def main():
    OUT_S.mkdir(parents=True, exist_ok=True)
    OUT_L.mkdir(parents=True, exist_ok=True)
    specs = [("aarav", persona_aarav, 42000, "csv"), ("priya", persona_priya, 85000, "xlsx"),
             ("rohan", persona_rohan, 30000, "pdf")]
    for idx, (name, fn, opening, fmt) in enumerate(specs):
        g = Gen(random.Random(2026 + idx))
        fn(g)
        rows = finalize(g, opening)
        path = OUT_S / f"{name}_statement.{fmt}"
        {"csv": write_csv, "xlsx": write_xlsx}.get(fmt, lambda r, p: write_pdf(r, p, name.title() + " (demo)"))(rows, path)
        (OUT_L / f"{name}.json").write_text(json.dumps(rows, indent=1))
        n_anom = sum(r["is_anomaly"] for r in rows)
        print(f"{name}: {len(rows)} txns, {n_anom} anomalies -> {path.name}")


if __name__ == "__main__":
    main()
