# FinWise: Intelligent Financial Transaction Explainer
### PRD, build plan and checklist (LLM mini project, 2-day timeline)

---

## 1. Problem statement

Bank and UPI statements are long lists of cryptic rows (`UPI/DR/4321/SWIGGY/okaxis`, `POS 4411 AMZN MKTP`). Expense trackers can turn them into pie charts, but they don't tell you **why** spending changed, **which** expenses are unusual, or **what to do about it**. Generic chatbots can't fix this either: if you paste a statement into one, it invents numbers.

**FinWise** lets a user upload a statement and get **grounded natural-language insights**. The LLM categorises each transaction, explains unusual expenses, finds spending patterns and answers free-form questions. The deterministic engine computes every number it states, and a verifier checks those numbers before the answer is shown.

## 2. Goals and non-goals

| Goals (in scope) | Non-goals (cut for 2 days) |
|---|---|
| Upload CSV / XLSX / text-based PDF statements | Bank API / Account Aggregator integration |
| Auto-categorise transactions (hybrid rules + LLM) | Multi-user auth, roles, cloud deployment |
| Detect and **explain** unusual expenses | OCR of scanned/image PDFs |
| Spending patterns (recurring, weekday/weekend, top merchants, month-over-month) | Investment advice, payments or transfers |
| Chat assistant that answers questions about your own data | Mobile app |
| Financial Health Score with a plain-English rationale | Budget alerts / notifications |
| Evaluation numbers for the IEEE paper | |

## 3. Users

- **Primary:** a student or young professional who wants to understand where their money goes without building spreadsheets.
- **Demo persona:** "Alex", 3 months of synthetic Indian-context transactions (UPI, Swiggy, Uber, Netflix, rent, EMI).

## 4. Novelty (this becomes the paper's contribution)

The paper needs a contribution beyond "we called an LLM". FinWise makes three:

1. **Grounded Explain-then-Verify pipeline (core novelty).**
   Statistics find the facts: a robust z-score (median/MAD) per category and merchant, new-merchant detection, frequency spikes and duplicate charges. The LLM only **narrates** a structured fact sheet. A **Numeric Claim Verifier** then extracts every amount, percentage and date from the LLM output and checks it against the fact sheet. If a claim fails, the answer is regenerated once; if it fails again, the claim is flagged in the UI.
   → New metric: **Grounded Faithfulness Score (GFS)**, the share of numeric claims in the output that match the facts.
2. **Text-to-Analytics QA instead of context stuffing.**
   For a chat question, the LLM does not read the raw statement. It picks a **tool** (`sum_by_category`, `top_merchants`, `compare_periods`, `find_transactions`, `recurring_payments`…) with arguments. The backend runs it over pandas and the LLM explains the result. This scales to large statements, cuts tokens and removes arithmetic hallucinations.
3. **Hybrid cost-aware categoriser.**
   A merchant dictionary and regex rules run first (free, instant). Only unknown merchants go to the LLM, in **batches** with few-shot examples and a JSON schema. Results are cached per merchant, so the next upload costs about zero.
   → Compared against rules-only and LLM-only in the paper (accuracy, macro-F1, tokens, latency).

**Privacy add-on (small, but worth a line in the paper):** PII masking removes account numbers, phone numbers, UPI IDs and names before any text is sent to the LLM.

## 5. Features and acceptance criteria

| # | Feature | Acceptance criteria |
|---|---|---|
| F1 | **Statement upload** | Drag-and-drop CSV/XLSX/PDF, plus a "Load sample data" button. Auto-detects date, description and amount (or debit/credit) columns. Shows a parsed-row count and errors. |
| F2 | **Categorisation** | Each transaction gets one of ~12 categories (Food & Dining, Transport, Shopping, Bills & Utilities, Subscriptions, Entertainment, Rent, Health, Education, Transfers, Income, Other) plus a `source` tag (rule / llm / user). The user can re-categorise inline, and the correction is cached. |
| F3 | **Unusual-expense explainer** | An "Unusual expenses: N" card (Issues-card style) with expandable rows. Each row shows the amount, why it's unusual (e.g. "3.2× your median Shopping spend") and a 1–2 sentence LLM explanation with a suggested action. |
| F4 | **Spending patterns** | Insights page: recurring subscriptions with total cost, weekday vs weekend, top merchants, month-over-month change per category, and an LLM summary paragraph. |
| F5 | **AI assistant (chat)** | Quick chips (Spending, Suggest Budget, Upcoming Bills, Subscriptions, Savings), free-text questions and streaming answers. Answers can include an inline chart (donut/bar) and show the tool used plus a "verified ✓ / unverified ⚠" badge. |
| F6 | **Dashboard** | Financial Health Score ring (0–100) with rationale, quick-overview segmented bar (spent/saved/bills), category donut, monthly trend line chart, recent transactions and an anomalies card. |
| F7 | **Transactions table** | Search, filter by category/month, sort and inline category edit. |
| F8 | **Evaluation script** | `python -m eval.run` prints the paper's tables: categoriser accuracy/F1 (3 variants), anomaly precision/recall, GFS with and without the verifier, and latency/token use. |

## 6. Design direction (mix of both references)

- **From Finwise (ref 1):** deep navy/near-black base `#0B0F1F`, violet primary `#8B5CF6` → `#A78BFA`, glass cards with a subtle border and glow, pill-shaped quick-action chips, a left sidebar with grouped nav, a gradient health-score ring, cyan/pink/amber accents, and an assistant greeting card with a glowing orb (CSS-only, no copied robot art).
- **From Eye-Able (ref 2):** clean data clarity: a big percentage donut with a single bold number, **horizontal level bars with % labels** (used for category budgets), an area **line chart over time** with point markers, a **red "Issues identified" count card + accordion** (→ "Unusual expenses"), and generous white space and grid alignment.
- **Result:** dark-first UI with a **light-mode toggle** (the Eye-Able look), using the same components in both themes.
- Font: Inter / Plus Jakarta Sans. Icons: lucide-react. Charts: Recharts.
- Layout: sidebar (Dashboard · Upload · Transactions · Insights · AI Assistant · Settings) + top bar (page title, search, theme toggle, profile pill).

## 7. Architecture

```
React (Vite + TS + Tailwind + Recharts)
        │  REST + SSE (chat streaming)
FastAPI (Python 3.11)
 ├─ ingest/      parsers (CSV, XLSX, PDF via pdfplumber) → normalised schema
 ├─ privacy/     PII masker
 ├─ categorize/  rules + merchant cache → batched LLM fallback
 ├─ analytics/   pandas: aggregates, patterns, anomaly detector (robust z / MAD)
 ├─ llm/         provider adapter (Gemini | Groq | OpenAI | Claude), JSON mode, tools
 ├─ verify/      numeric claim extractor + checker → GFS
 ├─ chat/        tool-router (Text-to-Analytics) + explainer
 └─ db           SQLite (SQLModel): statements, transactions, merchant_cache, chat
eval/           synthetic labelled dataset + metrics scripts
```

**Data model (transactions):** `id, statement_id, date, description_raw, description_masked, merchant, amount, direction (debit/credit), category, category_source, is_anomaly, anomaly_score, anomaly_reason`.

**API:**
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/statements/upload` | Parse, mask, categorise and analyse; returns a summary |
| POST | `/api/statements/sample` | Load the demo dataset |
| GET | `/api/transactions` | Filter, search, paginate |
| PATCH | `/api/transactions/{id}` | Re-categorise (updates the merchant cache) |
| GET | `/api/dashboard` | Health score, overview, category split, trend, recent |
| GET | `/api/insights` | Patterns + LLM summary |
| GET | `/api/anomalies` | Unusual expenses + explanations |
| POST | `/api/chat` | SSE stream: tool call → result → verified answer |

**LLM provider:** pluggable through a `.env` key. Recommended for a student budget: **Gemini 2.x Flash (free tier)** or **Groq (Llama 3.x, free)**. OpenAI or Claude also work if you have a key. Without a key, a **mock mode** keeps the demo working (rules plus template explanations).

## 8. Evaluation plan (for the paper's Results section)

- **Dataset:** a generator creates about 450 synthetic transactions over 3 months for 3 personas. Each row has a ground-truth category, and about 25 injected anomalies (spikes, duplicates, new high-value merchants).
- **Experiments:**
  1. Categorisation: rules-only vs LLM-only vs **hybrid**, measuring accuracy, macro-F1, LLM calls/tokens and latency.
  2. Anomaly detection: precision / recall / F1 of robust-z vs plain z-score.
  3. Faithfulness: GFS of the **naive LLM** (raw rows in the prompt) vs **grounded** (fact sheet) vs **grounded + verifier**, on 30 benchmark questions.
  4. QA correctness: % of the 30 questions with an exactly correct numeric answer, context stuffing vs Text-to-Analytics.
- Output: tables and charts (PNG) exported for the paper and the PPT.

## 9. Build steps (2-day plan)

**Day 1: working product**
1. Scaffold the repo: `backend/` (FastAPI) and `frontend/` (Vite React TS Tailwind); one `README` with run commands.
2. Synthetic data generator + sample statements (CSV, XLSX, PDF).
3. Ingest + normaliser + PII masker.
4. Categoriser (rules → cache → batched LLM, with mock fallback).
5. Analytics + anomaly detector + health score.
6. LLM adapter, fact-sheet explainer, numeric verifier.
7. Chat: tool router + SSE streaming.
8. Frontend shell (sidebar, top bar, theme toggle) + Upload page.
9. Dashboard + Transactions pages.
10. Insights page + AI Assistant page (chips, streaming, inline charts, verified badge).

**Day 2: proof, paper, slides**
11. End-to-end test with all 3 sample formats; fix bugs; take UI screenshots.
12. Evaluation scripts → result tables and figures.
13. Collect team, faculty and college details (asked at this point).
14. IEEE conference paper: IEEEtran LaTeX → PDF, **exactly 6 pages** (abstract, intro, related work, methodology, implementation, results, conclusion, references).
15. PPT (~14 slides): title, problem, objectives, related work, architecture, methodology, novelty, implementation screenshots, results, demo flow, conclusion and future work, references, thank you.
16. Shortlist of IEEE conferences with open submission deadlines for you to submit to.

## 10. Checklist

### Product
- [ ] Repo scaffold, `.env.example`, one-command run instructions
- [ ] Sample data: 3 personas, CSV + XLSX + PDF, ground-truth labels
- [ ] Upload: CSV / XLSX / PDF parse + column auto-detect + error messages
- [ ] PII masking before every LLM call
- [ ] Hybrid categoriser + merchant cache + inline re-categorise
- [ ] Anomaly detector (robust z / MAD, duplicates, new merchants) + LLM explanations
- [ ] Patterns: recurring, weekday/weekend, top merchants, MoM change
- [ ] Health score with rationale
- [ ] Numeric claim verifier + verified badge in UI
- [ ] Chat: chips, free text, tool routing, streaming, inline charts
- [ ] Mock mode works with no API key
- [ ] Dark + light theme, responsive down to laptop width

### UI pages
- [ ] Upload · [ ] Dashboard · [ ] Transactions · [ ] Insights · [ ] AI Assistant · [ ] Settings (name, provider, theme)

### Evaluation
- [ ] Categoriser comparison table (3 variants)
- [ ] Anomaly P/R/F1 table
- [ ] GFS comparison (naive / grounded / grounded + verifier)
- [ ] QA accuracy (context stuffing vs Text-to-Analytics)
- [ ] Figures exported as PNG

### Paper (IEEE)
- [ ] Team, faculty, college, department and emails collected
- [ ] IEEEtran conference format, two-column, 10 pt
- [ ] Exactly 6 pages, checked in the compiled PDF
- [ ] Abstract (≤250 words) + index terms
- [ ] Architecture figure, results tables, 2–3 charts
- [ ] 15–20 real references in IEEE style
- [ ] Novelty clearly stated in the intro (contribution bullets)

### PPT
- [ ] ~14 slides, matches the app's visual theme
- [ ] Architecture diagram, screenshots, results charts
- [ ] Novelty slide + demo flow slide

## 11. Decisions (confirmed)
1. **LLM provider:** Groq (`llama-3.3-70b-versatile`) for the app; Gemini (`gemini-2.5-flash`) supported as an alternative and for the evaluation. Offline mock mode when no key is set.
2. **Currency/context:** ₹ INR with UPI / NEFT / POS / ACH narrations and Indian digit grouping.
3. **Paper format:** LaTeX IEEEtran conference template, compiled to PDF with Tectonic.
