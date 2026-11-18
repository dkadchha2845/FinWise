// Build the FinWise mini-project presentation (structured deck: theme + layouts + sections).
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");
const path = require("path");
// Optional: write theme colours into the .pptx (helper from the pptx tooling). Skipped if unavailable.
let applyTheme = async () => {};
try { ({ applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js")); } catch { /* optional */ }

const THEME = {
  name: "FinWise Night Violet",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "14182E", lt1: "FFFFFF", dk2: "0B0E1F", lt2: "F2F3FA",
    accent1: "7C4DFF", accent2: "22D3EE", accent3: "F472B6", accent4: "F5B40B", accent5: "14B8A6", accent6: "EF4444",
    hlink: "7C4DFF", folHlink: "A78BFA",
  },
};
const HEX = THEME.colors;
const MUTED = "5B6180";
const W = 13.333, H = 7.5;

async function icon(Comp, color = "FFFFFF", size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function orb(size = 600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
   <radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.55"/><stop offset="100%" stop-color="#0B0E1F" stop-opacity="0"/></radialGradient>
   <radialGradient id="o" cx="38%" cy="32%" r="62%"><stop offset="0%" stop-color="#ffffff"/><stop offset="14%" stop-color="#DDD3FF"/><stop offset="45%" stop-color="#8B5CF6"/><stop offset="80%" stop-color="#4C1D95"/><stop offset="100%" stop-color="#2E1065"/></radialGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.24}" fill="url(#o)"/></svg>`;
  return "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "FinWise: Intelligent Financial Transaction Explainer";
  pres.author = "Dhrumil Kadchha, Prathameshjee Sisodia, Pratyush Chauhan, Akmal Ahmad";
  pres.subject = "LLM Mini Project, Dept. of CSE, Dayananda Sagar University";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---------------------------------------------------------------- layouts
  const footer = (dark) => [
    { text: { text: "FinWise · LLM Mini Project · Dept. of CSE, Dayananda Sagar University",
      options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: dark ? "A3A8C8" : MUTED, margin: 0 } } },
  ];
  pres.defineSlideMaster({
    title: "TITLE_DARK", background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.55, w: 7.6, h: 1.3, fontSize: 60, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 2.95, w: 7.4, h: 1.2, fontSize: 22, color: "C9CCE6", valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "SECTION_DARK", background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 0.5, w: 11.7, h: 0.9, fontSize: 36, bold: true, color: C.background1, valign: "middle", margin: 0 }, text: "" } },
      ...footer(true),
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: "A3A8C8", align: "right" },
  });
  pres.defineSlideMaster({
    title: "CONTENT_LIGHT", background: { color: HEX.lt1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 36, bold: true, color: C.text1, valign: "middle", margin: 0 }, text: "" } },
      ...footer(false),
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: MUTED, align: "right" },
  });

  // ---------------------------------------------------------------- helpers
  const I = {};
  const iconNames = ["FaFileInvoiceDollar", "FaUserShield", "FaTags", "FaTriangleExclamation", "FaComments", "FaCircleCheck",
    "FaChartPie", "FaBolt", "FaDatabase", "FaRobot", "FaMagnifyingGlassChart", "FaLightbulb", "FaServer", "FaReact",
    "FaPython", "FaCalculator", "FaRoute", "FaShieldHalved", "FaCopy", "FaStore", "FaArrowTrendUp", "FaUpload",
    "FaGaugeHigh", "FaListCheck", "FaFlask", "FaLock", "FaLayerGroup", "FaRepeat", "FaCoins", "FaEye"];
  for (const n of iconNames) I[n] = await icon(fa[n]);
  const ORB = await orb();

  const card = (s, x, y, w, h, opts = {}) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: opts.fill ?? C.background2 }, line: { color: opts.line ?? C.background2, width: 0.75 },
    shadow: opts.shadow ? { type: "outer", color: "1B1F3B", opacity: 0.12, blur: 8, offset: 2, angle: 90 } : undefined,
    objectName: opts.name,
  });
  const badge = (s, x, y, ic, d = 0.62, color = C.accent1) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 } });
    s.addImage({ data: I[ic], x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, altText: ic.replace(/^Fa/, "") + " icon", objectName: ic + " icon" });
  };
  const text = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, valign: "top", fontSize: 15, color: C.text1, ...o });
  const stat = (s, x, y, w, big, label, color = C.accent1, dark = false) => {
    text(s, big, { x, y, w, h: 0.9, fontSize: 48, bold: true, color, valign: "bottom" });
    text(s, label, { x, y: y + 0.95, w, h: 0.7, fontSize: 14, color: dark ? "C9CCE6" : MUTED });
  };
  const chartStyle = (title) => ({
    showTitle: true, title, titleFontSize: 14, titleColor: HEX.dk1, titleFontFace: "+mn-lt",
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
    catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valGridLine: { color: "E3E5F0", size: 0.5 }, catGridLine: { style: "none" },
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 11, dataLabelColor: HEX.dk1, dataLabelFontFace: "+mn-lt",
    dataLabelFormatCode: "0%", valAxisLabelFormatCode: "0%", valAxisMaxVal: 1, valAxisMinVal: 0,
    showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: MUTED, legendFontFace: "+mn-lt", barGapWidthPct: 60,
  });
  const notes = (s, n) => s.addNotes(n);

  // ================================================================ 1. Title
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addImage({ data: ORB, x: 7.9, y: 0.5, w: 5.6, h: 5.6, objectName: "Glowing orb", altText: "Decorative glowing orb" });
  s.addText("FinWise", { placeholder: "title" });
  s.addText("Intelligent Financial Transaction Explainer: plain-English insights from your bank statement, with every number verified", { placeholder: "body" });
  text(s, [
    { text: "Dhrumil Kadchha  ·  Prathameshjee Sisodia  ·  Pratyush Chauhan", options: { bold: true, color: C.background1, breakLine: true } },
    { text: "Guide: Akmal Ahmad, Assistant Professor", options: { color: "C9CCE6", breakLine: true } },
    { text: "Dept. of CSE, Dayananda Sagar University, Bengaluru  ·  LLM Mini Project 2026", options: { color: "A3A8C8" } },
  ], { x: 0.8, y: 5.1, w: 9, h: 1.3, fontSize: 16, paraSpaceAfter: 4 });
  notes(s, "Introduce the team and the project. FinWise turns a raw bank statement into natural-language insights: it categorises spending, explains unusual expenses, finds patterns and answers questions, and every number it says is checked against computed facts.");

  // ================================================================ 2. Problem
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Introduction" });
  s.addText("Statements tell you what you spent, not why", { placeholder: "title" });
  card(s, 0.6, 1.6, 5.6, 4.9, { fill: C.text2, line: C.text2, name: "Narration examples" });
  text(s, "What a bank statement actually looks like", { x: 0.95, y: 1.9, w: 5, h: 0.4, fontSize: 15, bold: true, color: C.background1 });
  text(s, [
    { text: "UPI/DR/4123../SWIGGY/okaxis/Payment", options: { breakLine: true } },
    { text: "POS 4411.. DECATHLON SPORTS PUNE", options: { breakLine: true } },
    { text: "ACH/BAJAJ FINANCE LTD/88231..", options: { breakLine: true } },
    { text: "NEFT/N1588../RAMESH KUMAR/RENT OCT", options: { breakLine: true } },
    { text: "UPI/DR/9811../ROHIT VERMA/ybl/Split" },
  ], { x: 0.95, y: 2.5, w: 5.0, h: 2.6, fontSize: 14, fontFace: "Courier New", color: "B9A8FF", paraSpaceAfter: 8 });
  text(s, "Hundreds of rows a month, with no reasons, patterns or warnings.", { x: 0.95, y: 5.4, w: 5, h: 0.8, fontSize: 15, italic: true, color: "C9CCE6" });
  const probs = [
    ["FaChartPie", "Trackers chart, but don't explain", "Pie charts show where money went, never why October cost 60% more than September."],
    ["FaRobot", "Chatbots invent numbers", "Given a raw statement, an LLM answered only 25% of our questions correctly and invented totals."],
    ["FaUserShield", "Privacy and cost", "Statements contain account numbers, UPI IDs and friends' names, and long files overflow API limits."],
  ];
  probs.forEach(([ic, h, b], i) => {
    const y = 1.6 + i * 1.7;
    badge(s, 6.7, y + 0.1, ic);
    text(s, h, { x: 7.55, y, w: 5.2, h: 0.45, fontSize: 20, bold: true });
    text(s, b, { x: 7.55, y: y + 0.5, w: 5.2, h: 1.0, fontSize: 15, color: MUTED });
  });
  notes(s, "Every UPI or card payment appears as a cryptic narration. Expense trackers only aggregate. General chatbots hallucinate numbers. Our own experiment showed context stuffing answered only 25% of questions correctly. Privacy and token limits are additional problems.");

  // ================================================================ 3. Objectives
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Introduction" });
  s.addText("Objectives", { placeholder: "title" });
  const objs = [
    ["FaUpload", "Ingest any statement", "Parse CSV, Excel and PDF exports from Indian banks automatically."],
    ["FaTags", "Categorise accurately", "Label every transaction into 15 categories, including long-tail merchants."],
    ["FaTriangleExclamation", "Explain unusual expenses", "Detect spikes, duplicates and new merchants, and explain each one."],
    ["FaArrowTrendUp", "Reveal spending patterns", "Subscriptions, upcoming bills, weekday vs weekend, month-over-month."],
    ["FaComments", "Answer questions", "Natural-language Q&A about the user's own financial habits."],
    ["FaCircleCheck", "Never hallucinate numbers", "Verify every ₹ amount and % before it is shown, and protect privacy."],
  ];
  objs.forEach(([ic, h, b], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * 4.1, y = 1.6 + row * 2.6;
    card(s, x, y, 3.8, 2.3, { name: `Objective ${i + 1}` });
    badge(s, x + 0.3, y + 0.3, ic);
    text(s, h, { x: x + 0.3, y: y + 1.05, w: 3.2, h: 0.45, fontSize: 18, bold: true });
    text(s, b, { x: x + 0.3, y: y + 1.5, w: 3.25, h: 0.75, fontSize: 14, color: MUTED });
  });
  notes(s, "Six objectives: ingestion, categorisation, anomaly explanation, pattern discovery, question answering, and the key requirement: no hallucinated numbers, with privacy preserved.");

  // ================================================================ 4. Literature
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Introduction" });
  s.addText("Literature survey: what exists and the gap", { placeholder: "title" });
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 } } });
  const rows = [
    [hdr("Approach"), hdr("Representative work"), hdr("Strength"), hdr("Gap FinWise addresses")],
    ["Expense-tracker apps", "Bank and budgeting apps", "Exact totals, charts", "No explanations; long-tail merchants left uncategorised"],
    ["Finance LLMs", "BloombergGPT, FinGPT, PIXIU", "Domain language understanding", "Market text, not personal statements; numbers unconstrained"],
    ["Numerical reasoning / tools", "FinQA, TAT-QA, PAL, ReAct, Toolformer", "Delegate maths to tools", "Generic; executes generated code; no finance verification"],
    ["Hallucination detection", "SelfCheckGPT, FActScore", "Measure factuality", "Extra LLM calls; not specialised for numeric claims"],
    ["Outlier detection", "Robust z-score (Iglewicz & Hoaglin)", "Statistically sound", "No context (habits, duplicates) and no explanations"],
  ];
  s.addTable(rows, {
    x: 0.6, y: 1.6, w: 12.1, colW: [2.4, 3.3, 2.6, 3.8], fontSize: 14, color: C.text1, fontFace: "+mn-lt",
    border: { type: "solid", pt: 0.75, color: "DADDEB" }, fill: { color: C.background1 }, rowH: 0.78, valign: "middle", margin: 0.08,
  });
  notes(s, "We surveyed five families of work. Finance LLMs focus on market text; tool-use methods execute generated code; hallucination detectors need extra LLM calls; statistical detectors lack context. FinWise combines tool use, robust statistics and a lightweight numeric verifier for personal finance.");

  // ================================================================ 4b. Problem formulation
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Introduction" });
  s.addText("Problem formulation", { placeholder: "title" });
  text(s, [
    { text: "Statement  D = { tᵢ = (dateᵢ, narrationᵢ, amountᵢ, directionᵢ) },  i = 1…n", options: { bold: true, breakLine: true } },
    { text: "15 spending categories K  ·  merchant m(sᵢ) extracted from each narration  ·  only a masked view μ(sᵢ) may leave the system", options: { color: MUTED } },
  ], { x: 0.6, y: 1.55, w: 12.1, h: 0.85, fontSize: 16, paraSpaceAfter: 4 });
  const tasks = [["T1", "Categorisation", "Learn f(narration, direction, amount) → k ∈ K. Maximise accuracy while minimising tokens sent to an external LLM.", C.accent5],
    ["T2", "Anomaly explanation", "Find the expenses A ⊆ D a user would find unusual, with a reason and an action consistent with D.", C.accent3],
    ["T3", "Grounded Q&A", "Answer question q with text y that is correct and numerically faithful: every claim c ∈ C(y) is supported by a computed fact f within a tolerance τ.", C.accent1]];
  tasks.forEach(([k, h, b, col], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 2.6, 3.8, 2.5, { name: k });
    text(s, k, { x: x + 0.3, y: 2.8, w: 1.0, h: 0.6, fontSize: 28, bold: true, color: col });
    text(s, h, { x: x + 1.15, y: 2.85, w: 2.5, h: 0.5, fontSize: 18, bold: true, valign: "middle" });
    text(s, b, { x: x + 0.3, y: 3.5, w: 3.25, h: 1.5, fontSize: 14, color: MUTED });
  });
  card(s, 0.6, 5.35, 12.1, 1.25, { fill: "EFEAFF", line: "D8CCFF", name: "GFS definition" });
  text(s, [
    { text: "Grounded Faithfulness Score:  GFS(y) = |{ c ∈ C(y) : c supported by F }| ÷ |C(y)|", options: { bold: true, color: C.accent1, breakLine: true } },
    { text: "Tolerance τ: ₹ amounts ±max(1, 1%) · percentages ±0.6 pt · ratios ±0.15.  GFS = 1 when an answer states no numbers.", options: { color: MUTED, fontSize: 14 } },
  ], { x: 0.9, y: 5.45, w: 11.6, h: 1.05, fontSize: 17, paraSpaceAfter: 4, valign: "middle" });
  notes(s, "This is the formal problem from Section III of the paper. Three tasks: categorisation under a token budget, anomaly explanation, and grounded question answering. GFS measures how well an answer satisfies the faithfulness constraint of T3.");

  // ================================================================ 5. Key idea
  pres.addSection({ title: "Methodology" });
  s = pres.addSlide({ masterName: "SECTION_DARK", sectionTitle: "Methodology" });
  s.addText("Key idea: the LLM explains, it never calculates", { placeholder: "title" });
  const colL = [["FaCalculator", "Parse and normalise every transaction"], ["FaCoins", "Compute totals, trends and the health score"], ["FaMagnifyingGlassChart", "Detect anomalies statistically"], ["FaShieldHalved", "Verify every number the LLM writes"]];
  const colR = [["FaTags", "Classify unfamiliar merchants (masked)"], ["FaRoute", "Pick the right analytics tool for a question"], ["FaComments", "Narrate results in plain English"], ["FaLightbulb", "Suggest one practical action"]];
  [[colL, "Deterministic engine", C.accent2, 0.8], [colR, "LLM (Groq gpt-oss-120b)", C.accent1, 6.95]].forEach(([items, head, col, x]) => {
    card(s, x, 1.7, 5.6, 4.9, { fill: "151A33", line: "2A3058", name: head });
    text(s, head, { x: x + 0.4, y: 1.95, w: 4.8, h: 0.5, fontSize: 22, bold: true, color: col });
    items.forEach(([ic, t], i) => {
      badge(s, x + 0.4, 2.7 + i * 0.95, ic, 0.56, col);
      text(s, t, { x: x + 1.15, y: 2.7 + i * 0.95 + 0.08, w: 4.2, h: 0.5, fontSize: 16, color: C.background1, valign: "middle" });
    });
  });
  notes(s, "This separation is the core design decision. Everything numeric is computed by deterministic Python code. The LLM is used only where language understanding helps: unknown merchants, intent routing and narration.");

  // ================================================================ 6. Architecture
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Methodology" });
  s.addText("System architecture", { placeholder: "title" });
  const box = (x, y, w, t, llm, name) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.95, rectRadius: 0.1, objectName: name,
      fill: { color: llm ? "EFEAFF" : "E6FAFD" }, line: { color: llm ? HEX.accent1 : "0EA5B7", width: 1.25 } });
    text(s, t, { x: x + 0.08, y, w: w - 0.16, h: 0.95, fontSize: 14, bold: true, align: "center", valign: "middle", color: C.text1 });
  };
  const arrow = (x1, y1, x2, y2) => s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipH: x2 < x1, flipV: y2 < y1, line: { color: "7A80A0", width: 1.75, endArrowType: "triangle" } });
  text(s, "Upload pipeline", { x: 0.6, y: 1.55, w: 4, h: 0.35, fontSize: 14, bold: true, color: MUTED });
  const r1 = [["Statement\nCSV · XLSX · PDF", 0], ["Parser +\ncolumn detection", 0], ["PII masking", 0], ["Hybrid\ncategoriser", 0], ["Anomaly engine\n+ SQLite", 0]];
  r1.forEach(([t], i) => { box(0.6 + i * 2.5, 2.0, 2.0, t, false, `Pipeline ${i + 1}`); if (i) arrow(0.6 + i * 2.5 - 0.5, 2.475, 0.6 + i * 2.5, 2.475); });
  box(8.1, 3.2, 2.0, "LLM batch\n(unknown only)", true, "LLM batch");
  arrow(9.1, 2.95, 9.1, 3.2);
  text(s, "Question answering", { x: 0.6, y: 4.45, w: 4, h: 0.35, fontSize: 14, bold: true, color: MUTED });
  const r2 = [["User question", false], ["LLM tool router", true], ["Typed tool\n(11 tools)", false], ["LLM narrator", true], ["Numeric claim\nverifier (GFS)", false]];
  r2.forEach(([t, llm], i) => { box(0.6 + i * 2.5, 4.9, 2.0, t, llm, `QA ${i + 1}`); if (i) arrow(0.6 + i * 2.5 - 0.5, 5.375, 0.6 + i * 2.5, 5.375); });
  s.addShape(pres.shapes.LINE, { x: 11.6, y: 2.95, w: 0.001, h: 1.43, line: { color: "7A80A0", width: 1.75 } });
  s.addShape(pres.shapes.LINE, { x: 5.6, y: 4.38, w: 6.0, h: 0.001, line: { color: "7A80A0", width: 1.75 } });
  arrow(5.6, 4.38, 5.6, 4.9);
  text(s, "stored transactions", { x: 6.0, y: 4.05, w: 2.2, h: 0.3, fontSize: 11, italic: true, color: MUTED });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 6.15, w: 0.35, h: 0.25, rectRadius: 0.05, fill: { color: "E6FAFD" }, line: { color: "0EA5B7" } });
  text(s, "Deterministic (computes every number)", { x: 1.05, y: 6.13, w: 4.2, h: 0.3, fontSize: 12, color: MUTED });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.4, y: 6.15, w: 0.35, h: 0.25, rectRadius: 0.05, fill: { color: "EFEAFF" }, line: { color: HEX.accent1 } });
  text(s, "LLM (language only, never arithmetic)", { x: 5.85, y: 6.13, w: 4.5, h: 0.3, fontSize: 12, color: MUTED });
  notes(s, "Top row: the upload pipeline. Only unfamiliar merchants, after masking, reach the LLM. Bottom row: question answering. The router picks one of eleven typed tools, the tool computes over stored data, the narrator explains it, and the verifier checks every number. If a claim fails, the narrator regenerates once.");

  // ================================================================ 7. Method I
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Methodology" });
  s.addText("Privacy masking and hybrid categorisation", { placeholder: "title" });
  card(s, 0.6, 1.6, 5.7, 4.9, { name: "Masking card" });
  badge(s, 0.9, 1.9, "FaLock");
  text(s, "PII masked before any LLM call", { x: 1.7, y: 1.95, w: 4.4, h: 0.5, fontSize: 18, bold: true, valign: "middle" });
  text(s, "Before", { x: 0.9, y: 2.8, w: 5, h: 0.3, fontSize: 12, bold: true, color: MUTED });
  text(s, "UPI/DR/175670685557/SNEHA PATIL/paytm/Split", { x: 0.9, y: 3.1, w: 5.2, h: 0.4, fontSize: 14, fontFace: "Courier New", color: C.accent6 });
  text(s, "After", { x: 0.9, y: 3.65, w: 5, h: 0.3, fontSize: 12, bold: true, color: MUTED });
  text(s, "UPI/DR/XXXX57/[PERSON]/paytm/Split", { x: 0.9, y: 3.95, w: 5.2, h: 0.4, fontSize: 14, fontFace: "Courier New", color: "0E9F6E" });
  text(s, "Reference numbers redacted in 518 of 535 narrations; 33 private payee names replaced with [PERSON], which is also a strong cue for the Transfers category.", { x: 0.9, y: 4.6, w: 5.1, h: 1.6, fontSize: 14, color: MUTED });
  const steps = [["FaDatabase", "Merchant cache", "Past decisions and user corrections: free and instant"],
    ["FaListCheck", "Rule dictionary", "86 patterns for well-known Indian merchants and billers"],
    ["FaRobot", "Batched LLM (JSON mode)", "Only unique unknown merchants, 30 per call, with few-shot examples"],
    ["FaRepeat", "Fallback + learn", "Heuristic if offline; every answer is cached for next time"]];
  steps.forEach(([ic, h, b], i) => {
    const y = 1.6 + i * 1.25;
    badge(s, 6.8, y + 0.05, ic, 0.62, i === 2 ? C.accent1 : C.accent5);
    text(s, `${i + 1}. ${h}`, { x: 7.65, y, w: 5.1, h: 0.4, fontSize: 18, bold: true });
    text(s, b, { x: 7.65, y: y + 0.42, w: 5.1, h: 0.7, fontSize: 14, color: MUTED });
  });
  notes(s, "Masking runs before categorisation. The cascade means LLM cost grows with new merchants, not with transactions: on Aarav's statement, 153 transactions were labelled by rules and 56 by the LLM in a single call.");

  // ================================================================ 8. Method II
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Methodology" });
  s.addText("Context-aware anomaly detection", { placeholder: "title" });
  card(s, 0.6, 1.6, 12.1, 1.45, { fill: C.text2, line: C.text2, name: "Formula card" });
  text(s, [
    { text: "Robust z-score per category:   z = 0.6745 × (x − median) / MAD", options: { bold: true, color: C.background1, breakLine: true } },
    { text: "Flag a spike when z > 3.5, x ≥ 2.5 × median and x ≥ ₹500. Needs ≥ 5 past transactions in the category.", options: { color: "C9CCE6" } },
  ], { x: 0.95, y: 1.78, w: 11.5, h: 1.1, fontSize: 18, paraSpaceAfter: 6 });
  const rules = [["FaArrowTrendUp", "Spending spike", "₹4,250 at Swiggy is 8.9× your usual ₹475 there", C.accent1],
    ["FaEye", "Habitual-merchant suppression", "A regular payee charging its usual amount is never flagged (removes fuel false alarms)", C.accent5],
    ["FaCopy", "Duplicate charge", "Same merchant and amount within 1 day: Netflix ₹649 charged twice", C.accent3],
    ["FaStore", "New high-value merchant", "First-ever payee in the latest month and above the 95th percentile: Croma ₹18,990", C.accent4]];
  rules.forEach(([ic, h, b, col], i) => {
    const x = 0.6 + i * 3.05;
    card(s, x, 3.35, 2.85, 3.3, { name: h });
    badge(s, x + 0.25, 3.6, ic, 0.62, col);
    text(s, h, { x: x + 0.25, y: 4.35, w: 2.4, h: 0.75, fontSize: 17, bold: true });
    text(s, b, { x: x + 0.25, y: 5.1, w: 2.45, h: 1.4, fontSize: 14, color: MUTED });
  });
  notes(s, "Plain z-scores fail because large outliers inflate the mean and standard deviation, and duplicates are not outliers at all. We use the median-and-MAD robust z-score plus three domain rules. Each flag carries a reason containing the exact computed numbers, which grounds the LLM explanation.");

  // ================================================================ 9. Method III
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Methodology" });
  s.addText("Text-to-Analytics with Explain-then-Verify", { placeholder: "title" });
  const flow = [["FaRoute", "Route", "LLM maps the question to a tool + arguments (JSON)"],
    ["FaCalculator", "Compute", "Typed tool runs over the data: exact ₹ figures"],
    ["FaComments", "Narrate", "LLM explains only the numbers it was given"],
    ["FaShieldHalved", "Verify", "Extract every ₹, % and × claim; match to facts"],
    ["FaRepeat", "Fix or flag", "Regenerate once with feedback; show a badge"]];
  flow.forEach(([ic, h, b], i) => {
    const x = 0.6 + i * 2.48;
    card(s, x, 1.6, 2.2, 2.75, { name: `Step ${h}` });
    badge(s, x + 0.79, 1.85, ic, 0.62, i % 2 ? C.accent2 : C.accent1);
    text(s, `${i + 1}. ${h}`, { x: x + 0.15, y: 2.6, w: 1.9, h: 0.4, fontSize: 18, bold: true, align: "center" });
    text(s, b, { x: x + 0.15, y: 3.05, w: 1.9, h: 1.2, fontSize: 14, color: MUTED, align: "center" });
    if (i < 4) s.addShape(pres.shapes.LINE, { x: x + 2.2, y: 2.97, w: 0.28, h: 0.001, line: { color: "7A80A0", width: 1.75, endArrowType: "triangle" } });
  });
  card(s, 0.6, 4.7, 7.3, 1.9, { fill: "EFEAFF", line: "D8CCFF", name: "GFS card" });
  text(s, [
    { text: "Grounded Faithfulness Score (new metric)", options: { bold: true, fontSize: 18, breakLine: true } },
    { text: "GFS = supported numeric claims ÷ all numeric claims", options: { fontSize: 16, color: C.accent1, bold: true, breakLine: true } },
    { text: "Tolerance: ₹ ±1% · percentages ±0.6 pt · ratios ±0.15. No extra LLM calls needed.", options: { fontSize: 14, color: MUTED } },
  ], { x: 0.95, y: 4.9, w: 6.8, h: 1.6, paraSpaceAfter: 6 });
  text(s, "Each question costs exactly 2 LLM calls (+ at most 1 regeneration), whatever the statement length. Verification is a deterministic parser: no extra model call, O(|claims| × |facts|).", { x: 8.3, y: 4.75, w: 4.4, h: 1.9, fontSize: 14, color: MUTED });
  notes(s, "The LLM never sees the raw statement during Q&A, so prompt size does not grow with the statement. The verifier is a deterministic parser: it handles Indian formats such as lakh and k. GFS is our proposed metric; 1.0 means every number was supported.");

  // ================================================================ 9b. Tools
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Methodology" });
  s.addText("Eleven typed analytics tools", { placeholder: "title" });
  const th = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 } } });
  const tools = [["spending_summary", "month", "Totals, savings rate, spend by category"], ["category_spend", "category, month", "Total, mean, max, top merchants"],
    ["top_merchants", "n, month, category", "Ranked merchants with totals"], ["compare_months", "month A, month B", "Per-category change (₹ and %)"],
    ["find_transactions", "text, category, range, month", "Matching rows and their total"], ["subscriptions", "–", "Recurring services, monthly and annual cost"],
    ["upcoming_bills", "–", "Recurring payments due in the next 30 days"], ["unusual_expenses", "–", "Flagged anomalies with computed reasons"],
    ["budget_suggestion", "–", "50/30/20 targets vs current averages"], ["health_score", "–", "0–100 score and its five components"],
    ["spending_patterns", "–", "Weekday vs weekend, recurring, month-over-month"]];
  s.addTable([[th("Tool"), th("Arguments"), th("Returns")], ...tools.map(([a, b, c]) => [{ text: a, options: { fontFace: "Courier New", bold: true } }, b, c])], {
    x: 0.6, y: 1.55, w: 12.1, colW: [3.4, 3.4, 5.3], fontSize: 14, color: C.text1, fontFace: "+mn-lt",
    border: { type: "solid", pt: 0.75, color: "DADDEB" }, fill: { color: C.background1 }, rowH: 0.42, valign: "middle", margin: 0.06,
  });
  notes(s, "The router chooses exactly one of these tools and returns typed JSON arguments. Arguments are validated: relative months like 'latest' are resolved, and category names are fuzzy-matched. The model never writes code.");

  // ================================================================ 9c. Health score + patterns
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Methodology" });
  s.addText("Spending patterns and a transparent health score", { placeholder: "title" });
  const hs = [["Savings rate r", "40 × r / 30", "40"], ["Discretionary share d", "20 − 0.5 × max(0, d − 30)", "20"], ["Subscriptions u (% of income)", "15 − 3 × max(0, u − 3)", "15"],
    ["Unusual expenses nₐ", "10 − 1.5 × nₐ", "10"], ["Stability (CV of monthly spend)", "15 − 30 × CV", "15"]];
  s.addTable([[th("Component"), th("Points (clipped to 0…max)"), th("Max")], ...hs], {
    x: 0.6, y: 1.55, w: 7.4, colW: [3.0, 3.6, 0.8], fontSize: 14, color: C.text1, fontFace: "+mn-lt",
    border: { type: "solid", pt: 0.75, color: "DADDEB" }, fill: { color: C.background1 }, rowH: 0.55, valign: "middle", margin: 0.08,
  });
  text(s, "Labels: ≥ 80 Excellent · ≥ 65 Good · ≥ 45 Fair · otherwise Needs attention", { x: 0.6, y: 5.1, w: 7.4, h: 0.4, fontSize: 14, color: MUTED });
  card(s, 8.4, 1.55, 4.3, 5.0, { name: "Recurring rule" });
  badge(s, 8.7, 1.85, "FaRepeat", 0.62, C.accent5);
  text(s, "Recurring payment rule", { x: 9.5, y: 1.9, w: 3.0, h: 0.5, fontSize: 18, bold: true, valign: "middle" });
  const rr = ["Seen in ≥ M − 1 of M months", "Median gap of 20–40 days", "≤ 1.5 payments per month", "Amount CV ≤ 0.35 for bills, subscriptions, rent and EMI; ≤ 0.03 otherwise", "Next due date = last payment + median gap"];
  text(s, rr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < rr.length - 1 } })), { x: 8.7, y: 2.7, w: 3.8, h: 3.7, fontSize: 14, paraSpaceAfter: 8 });
  notes(s, "Every point of the health score traces back to a measurable behaviour, which is what makes it explainable. Recurring-payment detection powers the subscriptions and upcoming-bills tools.");

  // ================================================================ 10. Novelty
  s = pres.addSlide({ masterName: "SECTION_DARK", sectionTitle: "Methodology" });
  s.addText("Novelty and contributions", { placeholder: "title" });
  const nov = [["FaShieldHalved", "Grounded Explain-then-Verify", "Deterministic facts → LLM narration → numeric verification → one targeted regeneration."],
    ["FaGaugeHigh", "Grounded Faithfulness Score", "A reference-free metric for numeric hallucination in financial explanations."],
    ["FaRoute", "Text-to-Analytics Q&A", "Typed tools instead of raw context: 90% vs 25% accuracy, about 5× fewer tokens."],
    ["FaLayerGroup", "Cost-aware hybrid categoriser", "Cache → rules → batched LLM, with PII masking: 97.2% accuracy, 49% fewer tokens."]];
  nov.forEach(([ic, h, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.8 + col * 6.0, y = 1.7 + row * 2.5;
    card(s, x, y, 5.7, 2.2, { fill: "151A33", line: "2A3058", name: h });
    badge(s, x + 0.35, y + 0.35, ic, 0.7, i % 2 ? C.accent3 : C.accent1);
    text(s, h, { x: x + 1.3, y: y + 0.35, w: 4.2, h: 0.7, fontSize: 20, bold: true, color: C.background1, valign: "middle" });
    text(s, b, { x: x + 1.3, y: y + 1.05, w: 4.2, h: 1.0, fontSize: 15, color: "C9CCE6" });
  });
  notes(s, "These four contributions form the research novelty claimed in the IEEE paper. The anomaly detector with habitual-merchant suppression is a fifth, supporting contribution.");

  // ================================================================ 11. Implementation
  pres.addSection({ title: "Implementation" });
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Implementation" });
  s.addText("Implementation", { placeholder: "title" });
  const stack = [["FaPython", "Backend", "Python 3.12 · FastAPI · pandas · pdfplumber · SQLite · SSE streaming"],
    ["FaRobot", "AI layer", "Groq gpt-oss-120b · Gemini fallback · JSON mode · retries, cache, rate limiting · offline mode"],
    ["FaReact", "Frontend", "React · TypeScript · Tailwind CSS · Recharts · dark and light themes"]];
  stack.forEach(([ic, h, b], i) => {
    const y = 1.6 + i * 1.6;
    badge(s, 0.6, y, ic, 0.62, [C.accent5, C.accent1, C.accent2][i]);
    text(s, h, { x: 1.45, y: y - 0.02, w: 3.8, h: 0.4, fontSize: 18, bold: true });
    text(s, b, { x: 1.45, y: y + 0.42, w: 3.9, h: 1.0, fontSize: 14, color: MUTED });
  });
  s.addImage({ path: path.join(__dirname, "img/ui_dashboard.jpg"), x: 5.6, y: 1.6, w: 7.1, h: 7.1 * 503 / 800, objectName: "Dashboard screenshot", altText: "FinWise dashboard" });
  text(s, "Dashboard: health score, quick overview, unusual-expense counter, cash flow and categories", { x: 5.6, y: 6.15, w: 7.1, h: 0.5, fontSize: 12, color: MUTED, italic: true });
  notes(s, "A full-stack web application. The backend exposes REST endpoints plus a streaming chat endpoint. The LLM layer is provider-agnostic via OpenAI-compatible APIs, and an offline mode keeps the app working without a key.");

  // ================================================================ 12. Screens
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Implementation" });
  s.addText("The AI assistant and insights in action", { placeholder: "title" });
  s.addImage({ path: path.join(__dirname, "img/ui_chat.jpg"), x: 0.6, y: 1.55, w: 5.45, h: 5.45 * 600 / 800, objectName: "Chat screenshot", altText: "AI assistant answering a question" });
  s.addImage({ path: path.join(__dirname, "img/ui_insights.jpg"), x: 6.4, y: 1.55, w: 6.3, h: 6.3 * 503 / 800, objectName: "Insights screenshot", altText: "Spending insights page" });
  text(s, "Ask in plain English: the tool used is shown, with a chart and a verified badge", { x: 0.6, y: 5.75, w: 5.45, h: 0.6, fontSize: 12, italic: true, color: MUTED });
  text(s, "AI summary (Verified · 10 numbers), insight cards, unusual expenses with explanations, budget health", { x: 6.4, y: 5.75, w: 6.3, h: 0.6, fontSize: 12, italic: true, color: MUTED });
  notes(s, "Left: the assistant answering 'Why was October so expensive compared to September?'. It chose the compare-months tool, and all 29 numbers in the answer were verified. Right: the insights page with AI-written, verified insight cards and anomaly explanations.");

  // ================================================================ 13. Dataset
  pres.addSection({ title: "Results" });
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("Dataset and experimental setup", { placeholder: "title" });
  [["535", "labelled INR transactions, 3 personas, 3 months, CSV/XLSX/PDF"], ["88", "unique merchants, 46 of them long-tail (not in rules)"], ["15", "planted anomalies: 9 spikes, 3 duplicates, 3 new merchants"], ["30", "benchmark questions with computed answers"]]
    .forEach(([b, l], i) => stat(s, 0.6 + i * 3.1, 1.6, 2.8, b, l, [C.accent1, C.accent5, C.accent6, C.accent2][i]));
  const exps = [["E1", "Categorisation", "Rules-only vs LLM-only vs hybrid: accuracy, macro-F1, calls, tokens"],
    ["E2", "Anomaly detection", "Global z, per-category z vs FinWise, plus an ablation of each rule"],
    ["E3", "Q&A faithfulness", "Context stuffing vs Text-to-Analytics vs + verifier: accuracy, claim precision, GFS"]];
  exps.forEach(([k, h, b], i) => {
    const y = 4.0 + i * 0.95;
    card(s, 0.6, y, 12.1, 0.8, { name: k });
    text(s, k, { x: 0.85, y, w: 0.8, h: 0.8, fontSize: 20, bold: true, color: C.accent1, valign: "middle" });
    text(s, h, { x: 1.7, y, w: 3.2, h: 0.8, fontSize: 17, bold: true, valign: "middle" });
    text(s, b, { x: 4.9, y, w: 7.6, h: 0.8, fontSize: 14, color: MUTED, valign: "middle" });
  });
  notes(s, "No public labelled personal statements exist, so we generated realistic Indian statements with real UPI, NEFT, POS and ACH narration formats and a long tail of local merchants. All runs use gpt-oss-120b on the Groq free tier.");

  // ================================================================ 14. E1
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("E1: Hybrid categorisation wins on accuracy and cost", { placeholder: "title" });
  s.addChart(pres.charts.BAR, [
    { name: "Accuracy", labels: ["Rules only", "LLM only", "Hybrid (ours)"], values: [0.643, 0.933, 0.972] },
    { name: "Macro-F1", labels: ["Rules only", "LLM only", "Hybrid (ours)"], values: [0.676, 0.858, 0.967] },
  ], { x: 0.6, y: 1.55, w: 7.4, h: 5.1, barDir: "col", chartColors: [HEX.accent1, HEX.accent2], ...chartStyle("Accuracy and macro-F1 (535 transactions, 15 classes)"), objectName: "E1 chart" });
  stat(s, 8.6, 1.6, 4.1, "97.2%", "accuracy, 95% CI [95.4, 98.3]; LLM-only [90.8, 95.1] does not overlap");
  stat(s, 8.6, 3.35, 4.1, "−49%", "tokens vs LLM-only (6,832 vs 13,319) with half the API calls", C.accent5);
  stat(s, 8.6, 5.1, 4.1, "36%", "of transactions needed the LLM (191 of 535)", C.accent3);
  notes(s, "Rules alone fail on the long tail. LLM-only mislabels some easy merchants and costs twice as much. The hybrid gets the best of both, and its Wilson confidence interval does not overlap the LLM-only one.");

  // ================================================================ 14b. Per-category + errors
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("E1 deep-dive: per-category F1 and error analysis", { placeholder: "title" });
  const pc = [["Food & Dining", 0.994], ["Transport", 0.975], ["Groceries", 0.952], ["Shopping", 0.891], ["Subscriptions", 0.962], ["Transfers", 1], ["Bills & Utilities", 1],
    ["Income", 1], ["Entertainment", 1], ["Health", 0.966], ["Rent & Housing", 0.8], ["EMI, Cash, Education", 1]];
  s.addChart(pres.charts.BAR, [{ name: "F1", labels: pc.map((x) => x[0]), values: pc.map((x) => x[1]) }], {
    x: 0.6, y: 1.5, w: 6.9, h: 5.2, barDir: "bar", chartColors: [HEX.accent1], ...chartStyle("Hybrid categoriser: F1 per category"),
    dataLabelFormatCode: "0.00", valAxisLabelFormatCode: "0.0", valAxisMinVal: 0.6, valAxisMaxVal: 1.0, showLegend: false, catAxisOrientation: "maxMin", barGapWidthPct: 40, objectName: "Per-category chart" });
  stat(s, 8.0, 1.55, 4.7, "344 / 344", "rule-labelled transactions correct (100%)", C.accent5);
  stat(s, 8.0, 3.15, 4.7, "92.1%", "accuracy on the 191 LLM-labelled transactions (46 merchants)", C.accent1);
  card(s, 8.0, 4.85, 4.7, 1.8, { name: "Error breakdown" });
  text(s, [
    { text: "All 15 errors come from 6 ambiguous merchants", options: { bold: true, breakLine: true } },
    { text: "kirana store → Shopping (4) · e-bike rental → Shopping (4) · rental platform → Subscriptions (3) · snack chain → Groceries (2) · 2 others. One user correction fixes each one permanently.", options: { color: MUTED, fontSize: 13 } },
  ], { x: 8.25, y: 4.95, w: 4.25, h: 1.6, fontSize: 15, paraSpaceAfter: 4 });
  notes(s, "Nine categories are perfect. Errors concentrate on genuinely ambiguous long-tail names. Rules were never wrong, which is why cascading rules before the LLM improves accuracy, not just cost.");

  // ================================================================ 15. E2
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("E2: The detector finds all 15 planted anomalies", { placeholder: "title" });
  s.addChart(pres.charts.BAR, [
    { name: "Ground-truth categories", labels: ["Global z-score", "Category z-score", "FinWise"], values: [0.571, 0.476, 1.0] },
    { name: "Predicted categories", labels: ["Global z-score", "Category z-score", "FinWise"], values: [0.435, 0.545, 0.938] },
  ], { x: 0.6, y: 1.55, w: 7.4, h: 5.1, barDir: "col", chartColors: [HEX.accent1, HEX.accent3], ...chartStyle("F1 score for anomaly detection"), objectName: "E2 chart" });
  text(s, "Ablation: remove one rule at a time", { x: 8.6, y: 1.65, w: 4.1, h: 0.45, fontSize: 18, bold: true });
  const abl = [["Habitual-merchant suppression", "Precision 1.00 → 0.71 (6 fuel false alarms)"], ["Minimum-history guard", "Precision 1.00 → 0.88"], ["Duplicate-charge rule", "Recall 1.00 → 0.80 (3 missed)"]];
  abl.forEach(([h, b], i) => {
    const y = 2.3 + i * 1.3;
    card(s, 8.6, y, 4.1, 1.1, { name: `Ablation ${i + 1}` });
    text(s, h, { x: 8.85, y: y + 0.12, w: 3.7, h: 0.4, fontSize: 15, bold: true });
    text(s, b, { x: 8.85, y: y + 0.55, w: 3.7, h: 0.45, fontSize: 14, color: MUTED });
  });
  text(s, "Recall 15/15 (95% CI 0.80–1.00) vs 6/15 for global z; Fisher p = 7 × 10⁻⁴.", { x: 8.6, y: 6.2, w: 4.1, h: 0.6, fontSize: 12, italic: true, color: MUTED });
  notes(s, "FinWise reaches F1 1.00 with true categories and 0.94 end-to-end with predicted categories. The ablation shows habitual-merchant suppression and the duplicate rule matter most. Honest caveat: thresholds were tuned on this synthetic data.");

  // ================================================================ 15b. Explanations
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("Generated anomaly explanations", { placeholder: "title" });
  const ex = [["Duplicate", "₹649 charged twice at Netflix on 02 Oct", "“Indicates a duplicate transaction; request a refund from Netflix support.”"],
    ["Spike (merchant)", "₹2,380 at Uber is 6.4× the usual ₹373", "“Check the receipt for distance or surge pricing.”"],
    ["Spike (category)", "₹4,860 electricity bill is 4.6× the median utility spend of ₹1,059", "“Inspect the bill for meter-reading errors.”"],
    ["New merchant", "First payment to Croma, ₹18,990, above 95% of expenses", "“Verify the purchase; set a limit for new merchants.”"]];
  s.addTable([[th("Type"), th("Computed reason (detector)"), th("Explanation / action (LLM, verified)")], ...ex.map(([a, b, c]) => [{ text: a, options: { bold: true } }, b, { text: c, options: { italic: true } }])], {
    x: 0.6, y: 1.55, w: 12.1, colW: [2.2, 4.8, 5.1], fontSize: 14, color: C.text1, fontFace: "+mn-lt",
    border: { type: "solid", pt: 0.75, color: "DADDEB" }, fill: { color: C.background1 }, rowH: [0.6, 0.85, 0.85, 0.85, 0.85], valign: "middle", margin: 0.1,
  });
  text(s, "The detector supplies the type and the exact numbers; the LLM adds a plausible cause and an action. Every number in the generated text passed verification.", { x: 0.6, y: 6.2, w: 12.1, h: 0.55, fontSize: 14, color: MUTED });
  notes(s, "These are real outputs on the Aarav statement. The numbers in the explanations come from the detector, which is why they are always right.");

  // ================================================================ 16. E3
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("E3: Verified answers are accurate and fully grounded", { placeholder: "title" });
  s.addChart(pres.charts.BAR, [
    { name: "Answer accuracy", labels: ["Context stuffing", "Text-to-Analytics", "+ Verifier (ours)"], values: [0.25, 0.9, 0.9] },
    { name: "Claim precision", labels: ["Context stuffing", "Text-to-Analytics", "+ Verifier (ours)"], values: [0.517, 0.968, 1.0] },
  ], { x: 0.6, y: 1.55, w: 7.4, h: 5.1, barDir: "col", chartColors: [HEX.accent1, HEX.accent2], ...chartStyle("30 questions across 3 statements"), objectName: "E3 chart" });
  stat(s, 8.6, 1.6, 4.1, "25% → 90%", "answer accuracy (95% CI 74–97%), p = 3.6×10⁻⁶");
  stat(s, 8.6, 3.35, 4.1, "100%", "of answers fully grounded with the verifier (GFS 0.983 → 1.000)", C.accent5);
  stat(s, 8.6, 5.1, 4.1, "≈5× fewer", "tokens per question (≈1.25k vs 6.3k)", C.accent3);
  notes(s, "Context stuffing could not even run on the largest statement: all 10 requests exceeded the API's per-request limit. The three wrong Text-to-Analytics answers came from upstream categorisation errors, not hallucination; the verifier guarantees faithfulness to computed facts.");

  // ================================================================ 16b. Discussion
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("Discussion: error analysis, cost and design lessons", { placeholder: "title" });
  const disc = [["FaMagnifyingGlassChart", "Faithful ≠ correct", "All 3 wrong answers had GFS = 1: they faithfully reported totals affected by an upstream category error. The verifier guarantees faithfulness to the computation, not the correctness of labels.", C.accent6],
    ["FaCoins", "Cost and scalability", "Cost grows with questions and new merchants, not statement length. A 12-month statement (≈800 txns) still needs ≈1.25k tokens per question; stuffing would need ≈4× the 6.3k seen here.", C.accent5],
    ["FaLightbulb", "Design lessons", "A narrow typed tool vocabulary was enough for every question. Deterministic verification is cheap enough for every response. Cascades improve accuracy as well as cost.", C.accent1]];
  disc.forEach(([ic, h, b, col], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.6, 3.8, 3.9, { name: h });
    badge(s, x + 0.3, 1.9, ic, 0.66, col);
    text(s, h, { x: x + 0.3, y: 2.75, w: 3.25, h: 0.5, fontSize: 19, bold: true });
    text(s, b, { x: x + 0.3, y: 3.3, w: 3.25, h: 3.1, fontSize: 15, color: MUTED });
  });
  notes(s, "From the Discussion section of the paper. Be clear about what the verifier guarantees and what it does not.");

  // ================================================================ 17. Demo flow
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Results" });
  s.addText("Live demo flow", { placeholder: "title" });
  const demo = [["FaUpload", "Upload", "Drop a CSV, Excel or PDF statement, or load a sample"],
    ["FaTags", "Categorise", "Rules + AI label 209 transactions in about 2 s"],
    ["FaChartPie", "Dashboard", "Health score 55 · cash flow · 6 unusual expenses"],
    ["FaLightbulb", "Insights", "AI summary and anomaly explanations, all verified"],
    ["FaComments", "Ask", "“Why was October so expensive?” → 29/29 numbers verified"]];
  s.addShape(pres.shapes.LINE, { x: 1.42, y: 2.62, w: 9.92, h: 0.001, line: { color: "D8CCFF", width: 2.5 } });
  demo.forEach(([ic, h, b], i) => {
    const x = 0.6 + i * 2.48;
    badge(s, x + 0.4, 2.2, ic, 0.84, C.accent1);
    text(s, `${i + 1}. ${h}`, { x, y: 3.3, w: 2.2, h: 0.45, fontSize: 18, bold: true });
    text(s, b, { x, y: 3.8, w: 2.2, h: 1.3, fontSize: 14, color: MUTED });
  });
  card(s, 0.6, 5.35, 12.1, 1.2, { fill: "EFEAFF", line: "D8CCFF", name: "Run commands" });
  text(s, [
    { text: "Run locally:  ", options: { bold: true } },
    { text: "uvicorn app.main:app --port 8000   ·   npm run dev  →  http://localhost:5173", options: { fontFace: "Courier New" } },
  ], { x: 0.9, y: 5.35, w: 11.6, h: 1.2, fontSize: 15, valign: "middle" });
  notes(s, "Demo script: load the Aarav sample, walk through the dashboard, open Spending Insights to show verified explanations, then ask two questions in the assistant, including one with a specific amount filter.");

  // ================================================================ 18. Limitations + future
  pres.addSection({ title: "Conclusion" });
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Conclusion" });
  s.addText("Threats to validity and future work", { placeholder: "title" });
  const lim = ["Synthetic statements; detector thresholds tuned on the same personas",
    "Small, templated Q&A benchmark (30 questions)",
    "Verifier checks numbers, not qualitative claims (“largest expense”)",
    "Single LLM evaluated; latency dominated by free-tier throttling"];
  const fut = ["Real, consented statements via India's Account Aggregator framework",
    "User study of trust and comprehension",
    "Hindi and code-mixed questions",
    "Semantic claim verification and on-device small models for full privacy"];
  [[lim, "Threats to validity", C.accent6, 0.6, "FaTriangleExclamation"], [fut, "Future work", C.accent5, 6.85, "FaFlask"]].forEach(([items, h, col, x, ic]) => {
    card(s, x, 1.6, 5.85, 5.0, { name: h });
    badge(s, x + 0.35, 1.9, ic, 0.62, col);
    text(s, h, { x: x + 1.15, y: 1.95, w: 4.3, h: 0.55, fontSize: 22, bold: true, valign: "middle" });
    text(s, items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
      { x: x + 0.35, y: 2.8, w: 5.2, h: 3.6, fontSize: 16, paraSpaceAfter: 10, color: C.text1 });
  });
  notes(s, "Be upfront about limitations: synthetic data and thresholds tuned on it, and the faithful-versus-correct distinction. Future work moves to real data through the Account Aggregator framework and a user study.");

  // ================================================================ 19. Conclusion
  s = pres.addSlide({ masterName: "SECTION_DARK", sectionTitle: "Conclusion" });
  s.addText("Conclusion", { placeholder: "title" });
  s.addImage({ data: ORB, x: 8.6, y: 1.4, w: 4.6, h: 4.6, objectName: "Orb", altText: "Decorative glowing orb" });
  const concl = ["LLMs become trustworthy for personal finance when they explain and never calculate",
    "97.2% categorisation accuracy at half the token cost of LLM-only",
    "All 15 planted anomalies detected and explained",
    "Q&A accuracy 25% → 90%, with 100% numerically grounded answers"];
  text(s, concl.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < concl.length - 1 } })),
    { x: 0.8, y: 1.8, w: 7.6, h: 3.4, fontSize: 20, color: C.background1, paraSpaceAfter: 14 });
  text(s, "Thank you · Questions?", { x: 0.8, y: 5.55, w: 7.6, h: 0.8, fontSize: 32, bold: true, color: "B9A8FF" });
  notes(s, "Summarise the four headline results and invite questions.");

  // ================================================================ 20. References
  s = pres.addSlide({ masterName: "CONTENT_LIGHT", sectionTitle: "Conclusion" });
  s.addText("Key references", { placeholder: "title" });
  const refs = [
    "S. Wu et al., “BloombergGPT: A large language model for finance,” arXiv:2303.17564, 2023.",
    "H. Yang, X.-Y. Liu, C. D. Wang, “FinGPT: Open-source financial LLMs,” arXiv:2306.06031, 2023.",
    "Z. Chen et al., “FinQA: A dataset of numerical reasoning over financial data,” EMNLP, 2021.",
    "L. Gao et al., “PAL: Program-aided language models,” ICML, 2023.",
    "S. Yao et al., “ReAct: Synergizing reasoning and acting in language models,” ICLR, 2023.",
    "Z. Ji et al., “Survey of hallucination in natural language generation,” ACM Computing Surveys, 2023.",
    "S. Min et al., “FActScore: Fine-grained atomic evaluation of factual precision,” EMNLP, 2023.",
    "B. Iglewicz, D. C. Hoaglin, How to Detect and Handle Outliers, ASQC Quality Press, 1993.",
    "L. Chen, M. Zaharia, J. Zou, “FrugalGPT: Using LLMs while reducing cost,” arXiv:2305.05176, 2023.",
  ];
  text(s, refs.map((t, i) => ({ text: `[${i + 1}]  ${t}`, options: { breakLine: i < refs.length - 1 } })),
    { x: 0.6, y: 1.6, w: 12.1, h: 5.0, fontSize: 14, color: C.text1, paraSpaceAfter: 6 });
  notes(s, "The full list of 23 references is in the IEEE paper.");

  const out = path.join(__dirname, "FinWise_Presentation.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})().catch((e) => { console.error(e); process.exit(1); });
