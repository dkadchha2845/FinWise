"""PII masking applied to every narration before it can reach an external LLM."""
from __future__ import annotations

import re

# Common Indian first names: a payee starting with one of these is treated as a private person.
FIRST_NAMES = set("""
aarav aditya akash amit anil anjali ankit ankita anita arjun arun ashok asha deepak deepika divya gaurav geeta
harish ishaan kavya karan kiran krishna kunal lakshmi mahesh manish meera mohan neha nikhil nisha pooja pradeep
prakash priya rahul raj rajesh ramesh ravi rekha ritu rohan rohit sachin sandeep sanjay sneha sunil sunita suresh
swati tanvi varun vijay vikram vinod vishal yash ananya riya saanvi diya ishita aditi shreya sakshi simran
""".split())

RX_UPI = re.compile(r"\b[\w.\-]+@[a-z]+\b", re.I)
RX_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")
RX_PHONE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)")
RX_PAN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
RX_LONGNUM = re.compile(r"\d{6,}")


def is_person(name: str) -> bool:
    toks = name.lower().split()
    return 1 <= len(toks) <= 3 and toks[0] in FIRST_NAMES


def mask_text(text: str) -> str:
    t = RX_EMAIL.sub("[EMAIL]", text)
    t = RX_UPI.sub("[UPI_ID]", t)
    t = RX_PAN.sub("[PAN]", t)
    t = RX_PHONE.sub("[PHONE]", t)
    t = RX_LONGNUM.sub(lambda m: "X" * 4 + m.group()[-2:], t)
    return t


def masked_view(description: str, merchant: str) -> str:
    """Compact, masked view sent to the LLM: channel + payee + note, without refs or person names."""
    t = mask_text(description)
    if is_person(merchant):
        for tok in merchant.split():
            t = re.sub(rf"\b{re.escape(tok)}\b", "", t, flags=re.I)
        t = re.sub(r"/\s*/", "/[PERSON]/", t, count=1) if "/" in t else t + " [PERSON]"
        t = re.sub(r"\s{2,}", " ", t)
    return t.strip()
