import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  Loader2,
  Plus,
  Save,
  Shuffle,
  WandSparkles,
  X,
} from "lucide-react";
import { db } from "../lib/supabase";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "../lib/supabaseData";
import {
  generateQuizPaper,
  GENERATED_QUIZ_COLLECTION,
  QUIZ_PAPERS_COLLECTION,
  saveGeneratedQuizPaper,
} from "../lib/quizPaperGenerator";

const labelClass = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100";
const smallButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

// Distinct Part B numbers (11, 12 …); (a)/(b) options share a number.
const getSixteenGroupCount = (generatedQuiz) => {
  const sectionB = generatedQuiz?.sections?.sectionB || [];
  return new Set(sectionB.map((q) => q?.orGroup ?? q?.id)).size;
};

const getQuestionTotal = (generatedQuiz) => {
  const sectionA = generatedQuiz?.sections?.sectionA || [];
  const sectionAMarks = sectionA.reduce(
    (sum, question) => sum + Number(question?.marks || 0),
    0
  );
  // (a)/(b) are alternatives — 16 marks per Part B number, not per question.
  return sectionAMarks + getSixteenGroupCount(generatedQuiz) * 16;
};

// Load mammoth.js once from CDN; resolves immediately if already loaded
const loadMammoth = () =>
  new Promise((resolve, reject) => {
    if (globalThis.mammoth) {
      resolve(globalThis.mammoth);
      return;
    }
    const existing = document.querySelector('script[data-mammoth]');
    if (existing) {
      existing.addEventListener("load", () => resolve(globalThis.mammoth));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js";
    script.dataset.mammoth = "1";
    script.onload = () => {
      if (globalThis.mammoth) resolve(globalThis.mammoth);
      else reject(new Error("mammoth failed to initialize"));
    };
    script.onerror = () => reject(new Error("mammoth CDN load error"));
    document.head.appendChild(script);
  });

// Load pdf.js once from CDN; sets up worker src and resolves
const loadPdfJs = () =>
  new Promise((resolve, reject) => {
    if (globalThis.pdfjsLib) {
      resolve(globalThis.pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const lib = globalThis.pdfjsLib;
      if (!lib) {
        reject(new Error("PDF.js failed to initialize"));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(lib);
    };
    script.onerror = () => reject(new Error("PDF.js CDN load error"));
    document.head.appendChild(script);
  });

// Load JSZip once from CDN; used to read/rewrite the .docx template (a zip file)
const loadJsZip = () =>
  new Promise((resolve, reject) => {
    if (globalThis.JSZip) {
      resolve(globalThis.JSZip);
      return;
    }
    const existing = document.querySelector("script[data-jszip]");
    if (existing) {
      existing.addEventListener("load", () => resolve(globalThis.JSZip));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.dataset.jszip = "1";
    script.onload = () => {
      if (globalThis.JSZip) resolve(globalThis.JSZip);
      else reject(new Error("JSZip failed to initialize"));
    };
    script.onerror = () => reject(new Error("JSZip CDN load error"));
    document.head.appendChild(script);
  });

/**
 * Parse a quiz paper PDF (including scanned/photographed papers) using
 * Gemini Vision API. Renders each page to a canvas, sends the images to
 * Gemini 1.5 Flash, and returns structured questions.
 */
const parsePdfWithGemini = async (file, onProgress) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not set in .env");

  // ── Step 1: render every PDF page to a PNG via canvas ──────────────────
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageImages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Rendering page ${i} of ${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    // scale=2 gives ~1190×1684px for A4 — good enough for OCR
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    // strip the "data:image/png;base64," prefix
    pageImages.push(canvas.toDataURL("image/png").split(",")[1]);
  }

  // ── Step 2: build Gemini request with all page images ──────────────────
  onProgress?.("Analysing with Gemini Vision…");

  const prompt = `You are extracting questions from an internal assessment exam paper.
The paper has two sections: PART A (2-mark questions) and PART B (16-mark questions).

Return ONLY a valid JSON object — no markdown fences, no explanation:
{
  "title": "<Course Code & Title if visible, else empty string>",
  "questions": [
    {
      "id": "q-a-1",
      "question": "<complete question text>",
      "marks": 2,
      "type": "2mark",
      "difficulty": "medium"
    },
    {
      "id": "q-b-11a",
      "question": "<complete question text>",
      "marks": 16,
      "type": "16mark",
      "difficulty": "medium"
    }
  ]
}

Rules:
- PART A rows (numbered 1–10) → marks:2, type:"2mark"
- PART B rows (11a, 11b, 12a … ) → marks:16, type:"16mark"
- Capture the COMPLETE question text including sub-parts (i, ii, iii, iv)
- Skip: (OR) separators, column headers (Q.No, KL, CO, PI), footer/signature rows
- id format: "q-a-1" for Part A #1, "q-b-11a" for Part B 11(a)`;

  const parts = [
    { text: prompt },
    ...pageImages.map((b64) => ({
      inline_data: { mime_type: "image/png", data: b64 },
    })),
  ];

  // gemini-1.5-flash was retired on v1beta; try current vision-capable models
  // in order and fall through on "model not found / unsupported" errors.
  const VISION_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];

  let result = null;
  let lastError = "";
  for (let i = 0; i < VISION_MODELS.length; i++) {
    const model = VISION_MODELS[i];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (res.ok) {
      result = await res.json();
      break;
    }

    const err = await res.json().catch(() => ({}));
    lastError = err?.error?.message || res.statusText;
    // Only fall through to the next model when this one is missing/unsupported.
    const isModelError =
      res.status === 404 ||
      /not found|not supported|unsupported/i.test(lastError);
    if (!isModelError || i === VISION_MODELS.length - 1) {
      throw new Error(`Gemini API error: ${lastError}`);
    }
  }

  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // ── Step 3: parse the JSON Gemini returned ─────────────────────────────
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON — try again.");

  const data = JSON.parse(jsonMatch[0]);
  const title =
    String(data?.title || "").trim() ||
    file.name.replace(/\.pdf$/i, "").trim() ||
    "Imported Quiz Paper";
  const questions = Array.isArray(data?.questions) ? data.questions : [];

  if (questions.length === 0)
    throw new Error("Gemini found no questions. Check that the PDF contains a Part A / Part B table.");

  return { title, subject: title, questions };
};

// Static fallback template shown while docx loads or if it fails
function QuizPaperTemplate() {
  return (
    <div className="space-y-6 p-6 font-serif">
      <div className="border-b-2 border-slate-800 pb-4 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Institution Name
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">
          Department of Computer Science &amp; Engineering
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          Internal Assessment Examination
        </p>
        <div className="mx-auto mt-3 grid max-w-lg grid-cols-3 gap-4 text-xs text-slate-600">
          <span>Subject: __________</span>
          <span>Date: __________</span>
          <span>Time: __________</span>
          <span>Semester: ______</span>
          <span>Max. Marks: 100</span>
          <span>Reg.No: __________</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-slate-300 pb-1">
          <h3 className="text-base font-bold text-slate-900">
            PART – A &nbsp; (2 × 10 = 20 Marks)
          </h3>
          <span className="text-xs text-slate-500">Answer ALL Questions</span>
        </div>
        <div className="mt-3 space-y-4">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <span className="min-w-8 text-sm font-semibold text-slate-700">
                {i + 1}.
              </span>
              <div className="flex-1 border-b border-dashed border-slate-300 pb-3">
                <p className="text-xs text-slate-400">[2-mark question]</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-slate-300 pb-1">
          <h3 className="text-base font-bold text-slate-900">
            PART – B &nbsp; (16 × 5 = 80 Marks)
          </h3>
          <span className="text-xs text-slate-500">Answer ALL Questions</span>
        </div>
        <div className="mt-3 space-y-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex gap-3">
                <span className="min-w-8 text-sm font-semibold text-slate-700">
                  {11 + i}.
                </span>
                <div className="flex-1 border-b border-dashed border-slate-300 pb-3">
                  <p className="text-xs text-slate-400">[16-mark question]</p>
                </div>
              </div>
              <div className="ml-8 space-y-2">
                {["(a)", "(b)"].map((label) => (
                  <p key={label} className="text-xs text-slate-500">
                    {label} _______________________________________________
                    (8 marks)
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Template page helpers ────────────────────────────────────────────────────

/**
 * Split mammoth HTML into pages.
 * Primary: split on <hr class="page-break"> markers emitted by mammoth's styleMap.
 * Fallback: group top-level blocks by character count when no page-break markers exist.
 */
function splitIntoPages(html, threshold = 1400) {
  if (!html) return [];
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    const blocks = Array.from(parsed.body.children);

    // ── Primary: split on Word page-break markers ──────────────────────────
    const hasPageBreaks = blocks.some(
      (b) => b.tagName === "HR" && b.classList.contains("page-break")
    );
    if (hasPageBreaks) {
      const pages = [];
      let current = "";
      blocks.forEach((block) => {
        if (block.tagName === "HR" && block.classList.contains("page-break")) {
          if (current.trim()) pages.push(current);
          current = "";
        } else {
          current += block.outerHTML || "";
        }
      });
      if (current.trim()) pages.push(current);
      return pages.length > 0 ? pages : [html];
    }

    // ── Fallback: character-count grouping ─────────────────────────────────
    if (blocks.length < 3) return [html];
    const pages = [];
    let current = "";
    let len = 0;
    blocks.forEach((block) => {
      const fragment = block.outerHTML || "";
      current += fragment;
      len += fragment.length;
      if (len >= threshold) {
        pages.push(current);
        current = "";
        len = 0;
      }
    });
    if (current) pages.push(current);
    return pages.length > 0 ? pages : [html];
  } catch {
    return [html];
  }
}

const navBtnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-35";

/** Single-page slide carousel for the docx template preview */
function TemplatePagedViewer({ content, loading }) {
  const [activePage, setActivePage] = useState(0);
  const [dir, setDir] = useState("right"); // "right" | "left"

  const pages = useMemo(() => splitIntoPages(content), [content]);
  const total = pages.length;

  const goTo = (idx, direction) => {
    setDir(direction);
    setActivePage(Math.max(0, Math.min(total - 1, idx)));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        <p className="text-xs text-slate-400">Loading template…</p>
      </div>
    );
  }
  if (!content) return <QuizPaperTemplate />;

  return (
    <div className="flex flex-col">
      {/* ── Nav bar ── */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <button
          type="button"
          disabled={activePage === 0}
          onClick={() => goTo(activePage - 1, "left")}
          className={navBtnCls}
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-slate-500">
          Page {activePage + 1} / {total}
        </span>
        <button
          type="button"
          disabled={activePage === total - 1}
          onClick={() => goTo(activePage + 1, "right")}
          className={navBtnCls}
        >
          ›
        </button>
      </div>

      {/* ── Single full-size page with slide animation ── */}
      <div className="relative overflow-hidden">
        <div
          key={`${activePage}-${dir}`}
          className={`max-h-100 overflow-y-auto px-5 py-4 ${
            dir === "right" ? "quiz-slide-from-right" : "quiz-slide-from-left"
          }`}
        >
          <div className="overflow-x-auto">
            <div
              className="quiz-template-preview"
              dangerouslySetInnerHTML={{ __html: pages[activePage] || "" }}
            />
          </div>
        </div>
      </div>

      {/* ── Dot indicators ── */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-2">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i, i > activePage ? "right" : "left")}
              className={`rounded-full transition-all duration-150 ${
                i === activePage
                  ? "h-2 w-5 bg-indigo-500"
                  : "h-2 w-2 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Per-question renderer ────────────────────────────────────────────────────
function PreviewQuestion({ question, number }) {
  const parts = Array.isArray(question?.parts) ? question.parts : [];

  return (
    <article className="py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-bold text-slate-700">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <p className="flex-1 text-sm font-medium text-slate-900">
              {question?.question || "Untitled question"}
            </p>
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              {question?.marks || 0} M
            </span>
          </div>

          {parts.length > 0 && (
            <ol className="mt-3 space-y-2">
              {parts.map((part, partIndex) => (
                <li
                  key={part.id || `${question.id}-part-${partIndex}`}
                  className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  <span className="font-semibold">
                    {part.label || String.fromCharCode(97 + partIndex)}){" "}
                  </span>
                  {part.question}
                  <span className="ml-2 text-xs font-semibold text-slate-500">
                    ({part.marks} marks)
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </article>
  );
}

// WordprocessingML main namespace — used to read/create elements in document.xml
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Concatenate all <w:t> text inside a node
const getNodeText = (node) => {
  const tNodes = node.getElementsByTagNameNS(W_NS, "t");
  let text = "";
  for (let i = 0; i < tNodes.length; i++) text += tNodes[i].textContent || "";
  return text.trim();
};

/**
 * Write `text` into a table cell's first paragraph: clears any placeholder runs
 * (e.g. the blank spaces in the template) and appends a single run with the text.
 */
const setCellText = (xmlDoc, cell, text) => {
  const paras = cell.getElementsByTagNameNS(W_NS, "p");
  if (paras.length === 0) return;
  const para = paras[0];

  // Remove existing runs in this paragraph (keeps <w:pPr> formatting intact)
  const runs = Array.from(para.getElementsByTagNameNS(W_NS, "r"));
  runs.forEach((run) => run.parentNode.removeChild(run));

  const run = xmlDoc.createElementNS(W_NS, "w:r");
  const t = xmlDoc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.textContent = String(text || "");
  run.appendChild(t);
  para.appendChild(run);
};

/**
 * Fill the official IAT Word template (public/quiz-paper-template.docx) with the
 * generated questions and trigger a .docx download.
 *
 * Mapping: the template's "Question(s)" column is blank. Part A rows are numbered
 * 1–10; Part B rows are 11(a)/11(b) … 15(a)/15(b). We fill those blank cells in
 * document order from sectionA (2-mark) and sectionB (16-mark) respectively.
 */
const exportToTemplateDocx = async (generatedQuiz) => {
  const JSZip = await loadJsZip();

  const response = await fetch("/quiz-paper-template.docx");
  if (!response.ok) throw new Error("Quiz paper template not found.");
  const arrayBuffer = await response.arrayBuffer();

  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file("word/document.xml").async("string");

  const xmlDoc = new DOMParser().parseFromString(documentXml, "application/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Could not read the Word template.");
  }

  const sectionA = generatedQuiz.sections.sectionA || [];
  const sectionB = generatedQuiz.sections.sectionB || [];

  // Look up questions by the template's row label.
  // Part A: number string ("1" … "10"). Part B: "<n><a|b>" e.g. "11a".
  const partAByNumber = {};
  sectionA.forEach((q, idx) => {
    partAByNumber[String(idx + 1)] = q;
  });
  const partBByKey = {};
  sectionB.forEach((q) => {
    if (q?.orGroup && q?.orOption) {
      partBByKey[`${q.orGroup}${q.orOption}`.toLowerCase()] = q;
    }
  });

  // Classify every table row by its first cell: a plain number → Part A slot,
  // a "<n> (a|b)" label → Part B slot. Everything else (headers, info rows,
  // signature/CO tables) is ignored.
  const rows = xmlDoc.getElementsByTagNameNS(W_NS, "tr");
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagNameNS(W_NS, "tc");
    if (cells.length < 5) continue; // question rows have 5 columns
    const label = getNodeText(cells[0]);
    if (/^\d+$/.test(label)) {
      const q = partAByNumber[label];
      if (q) setCellText(xmlDoc, cells[1], q.question);
    } else if (/^\d+\s*\(\s*[ab]\s*\)$/i.test(label)) {
      // "11 (a)" → "11a"
      const key = label.replace(/[\s()]/g, "").toLowerCase();
      const q = partBByKey[key];
      if (q) setCellText(xmlDoc, cells[1], q.question);
    }
  }

  // Serialize back; re-add the XML declaration the serializer strips
  let serialized = new XMLSerializer().serializeToString(xmlDoc);
  if (!serialized.startsWith("<?xml")) {
    serialized =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + serialized;
  }
  zip.file("word/document.xml", serialized);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `quiz-paper-${Date.now()}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// PDF export formatted to match the exam paper template
const exportToPdf = (generatedQuiz) => {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const newPageIfNeeded = (spaceNeeded = 40) => {
    if (y + spaceNeeded > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const write = (text, { fontSize = 10, fontStyle = "normal", align = "left", indent = 0, after = 6, lineHeight = 14 } = {}) => {
    newPageIfNeeded(lineHeight + after);
    pdf.setFont("helvetica", fontStyle);
    pdf.setFontSize(fontSize);
    const maxW = contentWidth - indent;
    const lines = pdf.splitTextToSize(String(text || ""), maxW);
    const x = align === "center" ? pageWidth / 2 : margin + indent;
    pdf.text(lines, x, y, align === "center" ? { align: "center" } : undefined);
    y += lines.length * lineHeight + after;
  };

  const hRule = (after = 8) => {
    newPageIfNeeded(after + 4);
    pdf.setDrawColor(80, 80, 80);
    pdf.setLineWidth(0.75);
    pdf.line(margin, y, pageWidth - margin, y);
    y += after;
  };

  // Header
  write("Institution Name", { fontSize: 9, fontStyle: "normal", align: "center", after: 2 });
  write("Department of Computer Science & Engineering", { fontSize: 11, fontStyle: "bold", align: "center", after: 2 });
  write("Internal Assessment Examination", { fontSize: 10, fontStyle: "bold", align: "center", after: 8 });

  // Info row
  const infoY = y;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Max. Marks: ${generatedQuiz.totalMarks}`, margin, infoY);
  pdf.text("Time: 3 Hours", pageWidth / 2, infoY, { align: "center" });
  pdf.text(`Date: ${new Date().toLocaleDateString("en-IN")}`, pageWidth - margin, infoY, { align: "right" });
  y = infoY + 16;

  hRule(10);

  // Section A
  write("PART – A  (2 × " + generatedQuiz.sections.sectionA.length + " = " + generatedQuiz.sections.sectionA.length * 2 + " Marks)", {
    fontSize: 11,
    fontStyle: "bold",
    after: 2,
  });
  write("Answer ALL Questions", { fontSize: 9, after: 10 });

  generatedQuiz.sections.sectionA.forEach((q, idx) => {
    newPageIfNeeded(32);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    const numStr = `${idx + 1}. `;
    const numWidth = pdf.getTextWidth(numStr);
    pdf.text(numStr, margin, y);
    pdf.setFont("helvetica", "normal");
    const lines = pdf.splitTextToSize(q.question, contentWidth - numWidth);
    pdf.text(lines, margin + numWidth, y);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8.5);
    pdf.text("(2 marks)", pageWidth - margin, y, { align: "right" });
    y += lines.length * 13 + 10;
  });

  y += 8;
  hRule(10);

  // Section B
  write("PART – B  (16 × " + generatedQuiz.sections.sectionB.length + " = " + generatedQuiz.sections.sectionB.length * 16 + " Marks)", {
    fontSize: 11,
    fontStyle: "bold",
    after: 2,
  });
  write("Answer ALL Questions", { fontSize: 9, after: 10 });

  generatedQuiz.sections.sectionB.forEach((q, idx) => {
    const number = generatedQuiz.sections.sectionA.length + idx + 1;
    newPageIfNeeded(44);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    const numStr = `${number}. `;
    const numWidth = pdf.getTextWidth(numStr);
    pdf.text(numStr, margin, y);
    pdf.setFont("helvetica", "normal");
    const qLines = pdf.splitTextToSize(q.question, contentWidth - numWidth);
    pdf.text(qLines, margin + numWidth, y);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8.5);
    pdf.text("(16 marks)", pageWidth - margin, y, { align: "right" });
    y += qLines.length * 13 + 4;

    const parts = Array.isArray(q.parts) ? q.parts : [];
    parts.forEach((part, pIdx) => {
      newPageIfNeeded(26);
      const partLabel = `  ${part.label || String.fromCharCode(97 + pIdx)}) `;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const partLabelWidth = pdf.getTextWidth(partLabel);
      pdf.text(partLabel, margin + 12, y);
      const partLines = pdf.splitTextToSize(part.question, contentWidth - partLabelWidth - 12);
      pdf.text(partLines, margin + 12 + partLabelWidth, y);
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.text(`(${part.marks} marks)`, pageWidth - margin, y, { align: "right" });
      y += partLines.length * 12 + 6;
    });

    y += 8;
  });

  // Footer
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "italic");
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    `Generated on ${new Date().toLocaleString("en-IN")}`,
    pageWidth / 2,
    pageHeight - 24,
    { align: "center" }
  );

  pdf.save(`quiz-paper-${Date.now()}.pdf`);
};

export default function QuizGeneratorModal({
  open,
  onClose,
  createdBy = "",
  createdByName = "",
  renderAsPage = false,
}) {
  const [quizPapers, setQuizPapers] = useState([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [totalMarks, setTotalMarks] = useState(100);
  const [twoMarkCount, setTwoMarkCount] = useState(10);
  const [sixteenMarkCount, setSixteenMarkCount] = useState(5);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitType, setSplitType] = useState("2parts");
  const [difficulty, setDifficulty] = useState("mixed");
  const [questionType, setQuestionType] = useState("mixed");
  const [shuffle, setShuffle] = useState(true);
  const [generatedQuiz, setGeneratedQuiz] = useState(null);
  const [papersLoading, setPapersLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [templateContent, setTemplateContent] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [paperSearch, setPaperSearch] = useState("");
  const [papersReloadToken, setPapersReloadToken] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  const distributionTotal = useMemo(
    () => Number(twoMarkCount || 0) * 2 + Number(sixteenMarkCount || 0) * 16,
    [sixteenMarkCount, twoMarkCount]
  );
  const previewTotal = useMemo(() => getQuestionTotal(generatedQuiz), [generatedQuiz]);
  const canGenerate =
    selectedPaperIds.length >= 2 &&
    distributionTotal === Number(totalMarks) &&
    !generating &&
    !papersLoading;

  // Load quiz papers list
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const loadQuizPapers = async () => {
      setPapersLoading(true);
      setLoadError("");
      try {
        const snapshot = await getDocs(collection(db, QUIZ_PAPERS_COLLECTION));
        if (cancelled) return;
        const nextPapers = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) =>
            String(a.title || a.subject || a.id).localeCompare(
              String(b.title || b.subject || b.id)
            )
          );
        setQuizPapers(nextPapers);
        setSelectedPaperIds((prev) =>
          prev.filter((pid) => nextPapers.some((p) => p.id === pid))
        );
      } catch {
        if (!cancelled) {
          setQuizPapers([]);
          setLoadError("Unable to load quiz papers.");
        }
      } finally {
        if (!cancelled) setPapersLoading(false);
      }
    };

    void loadQuizPapers();
    return () => { cancelled = true; };
  }, [open, papersReloadToken]);

  // Load and render the Word template via mammoth.js
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const loadTemplate = async () => {
      setTemplateLoading(true);
      try {
        const mammoth = await loadMammoth();
        const response = await fetch("/quiz-paper-template.docx");
        if (!response.ok) throw new Error("Template not found");
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "br[type='page'] => hr.page-break",
              // preserve center-aligned paragraphs
              "p[style-name='heading 1'] => h2:fresh",
              "p[style-name='heading 2'] => h3:fresh",
            ],
            // keep column-width hints as inline width attributes
            includeDefaultStyleMap: true,
          }
        );
        if (!cancelled && result?.value) {
          setTemplateContent(result.value);
        }
      } catch {
        // Fallback to static QuizPaperTemplate component
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };

    void loadTemplate();
    return () => { cancelled = true; };
  }, [open]);

  // Keyboard close
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const handleImportQuizPaper = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      let title, subject, questions;

      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

      if (isPdf) {
        // Parse PDF quiz paper using Gemini Vision (works for scanned & digital PDFs)
        const parsed = await parsePdfWithGemini(file, (msg) => setImportError(msg));
        setImportError(""); // clear progress messages
        title     = parsed.title;
        subject   = parsed.subject;
        questions = parsed.questions;
      } else {
        // Parse JSON quiz paper
        const text = await file.text();
        const data = JSON.parse(text);
        title = String(data?.title || data?.subject || "").trim();
        if (!title) throw new Error('JSON must have a "title" or "subject" field.');
        questions = Array.isArray(data?.questions) ? data.questions : [];
        subject = String(data?.subject || title).trim();
      }

      if (!title) throw new Error("Could not determine paper title from file.");
      if (!Array.isArray(questions) || questions.length === 0)
        throw new Error("No questions found in the file.");

      const paperRef = doc(collection(db, QUIZ_PAPERS_COLLECTION));
      await setDoc(paperRef, {
        title,
        subject: subject || title,
        questions,
        createdAt: serverTimestamp(),
        createdBy: createdBy || null,
        ...(createdByName ? { createdByName } : {}),
      });

      setImportSuccess(
        `"${title}" imported successfully — ${questions.length} question${questions.length !== 1 ? "s" : ""} added.`
      );
      setPapersReloadToken((t) => t + 1);
    } catch (error) {
      setImportError(error?.message || "Failed to import quiz paper.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const togglePaperSelection = (paperId) => {
    setSelectedPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    );
    setStatusMessage("");
    setErrorMessage("");
  };

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const quiz = await generateQuizPaper({
        paperIds: selectedPaperIds,
        totalMarks,
        twoMarkCount,
        sixteenMarkCount,
        splitEnabled,
        splitType,
        difficulty,
        questionType,
        shuffle,
      });
      setGeneratedQuiz(quiz);
      setStatusMessage("Preview generated. Review the paper before saving.");
    } catch (error) {
      setGeneratedQuiz(null);
      setErrorMessage(error?.message || "Unable to generate quiz paper.");
    } finally {
      setGenerating(false);
    }
  };

  const handleExportWord = async () => {
    if (!generatedQuiz) return;
    setErrorMessage("");
    try {
      await exportToTemplateDocx(generatedQuiz);
      setStatusMessage("Word paper exported using the official template.");
    } catch (error) {
      setErrorMessage(error?.message || "Unable to export Word document.");
    }
  };

  const handleSave = async () => {
    if (!generatedQuiz || saving) return;
    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const savedQuiz = await saveGeneratedQuizPaper(generatedQuiz, { createdBy, createdByName });
      setGeneratedQuiz((prev) => ({ ...prev, id: savedQuiz.id }));
      setStatusMessage(`Saved to ${GENERATED_QUIZ_COLLECTION}/${savedQuiz.id}.`);
    } catch {
      setErrorMessage("Unable to save generated quiz.");
    } finally {
      setSaving(false);
    }
  };

  const filteredPapers = paperSearch.trim()
    ? quizPapers.filter((p) =>
        String(p.title || p.subject || p.id)
          .toLowerCase()
          .includes(paperSearch.trim().toLowerCase())
      )
    : quizPapers;

  const panelContent = (
    <div className="ui-modal__body pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-linear-to-r from-indigo-950 via-indigo-800 to-indigo-700 px-6 py-5 shadow-md shadow-indigo-900/20">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
            <WandSparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Staff Tools</p>
            <h2 className="text-lg font-bold text-white">Quiz Paper Generator</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Left panel: Inputs ── */}
        <section className="space-y-4">
          <>
              {/* Action buttons row */}
              <div className="flex gap-2">
                {/* '+' button: import a new quiz paper from PDF or JSON */}
                <label className="block w-full cursor-pointer">
                  <input
                    type="file"
                    accept=".json,.pdf"
                    onChange={handleImportQuizPaper}
                    disabled={importing}
                    className="hidden"
                  />
                  <span
                    title="Import quiz paper from PDF (template format) or JSON"
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      importing
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                    }`}
                  >
                    {importing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Plus className="h-5 w-5" />
                    )}
                    {importing ? "Importing…" : "Add Paper"}
                  </span>
                </label>
              </div>

              {/* Import feedback */}
              {importSuccess && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {importSuccess}
                </div>
              )}
              {importing && importError && (
                /* Progress messages while Gemini is working */
                <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                  {importError}
                </div>
              )}
              {!importing && importError && (
                /* Real error after import finishes */
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {importError}
                </div>
              )}

              {/* Quiz paper multi-select (checkbox list) */}
              <div className="space-y-2">
                <label className={labelClass}>
                  Select 2+ Quiz Papers
                </label>

                <input
                  type="text"
                  placeholder="Search papers…"
                  value={paperSearch}
                  onChange={(e) => setPaperSearch(e.target.value)}
                  className={inputClass}
                />

                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {papersLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                    </div>
                  ) : filteredPapers.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      {quizPapers.length === 0 ? "No quiz papers found." : "No matches."}
                    </p>
                  ) : (
                    filteredPapers.map((paper) => {
                      const isChecked = selectedPaperIds.includes(paper.id);
                      return (
                        <label
                          key={paper.id}
                          className={`flex cursor-pointer items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-sm transition last:border-b-0 hover:bg-slate-50 ${
                            isChecked ? "bg-indigo-50" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePaperSelection(paper.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
                          />
                          <span
                            className={`flex-1 truncate font-medium ${
                              isChecked ? "text-indigo-700" : "text-slate-700"
                            }`}
                          >
                            {paper.title || paper.subject || paper.id}
                          </span>
                          {isChecked && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                <p className="text-xs text-slate-500">
                  {selectedPaperIds.length} selected
                  {selectedPaperIds.length > 0 && selectedPaperIds.length < 2 && (
                    <span className="ml-1 text-amber-600">
                      (select at least 2)
                    </span>
                  )}
                </p>

                {loadError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {loadError}
                  </p>
                )}
              </div>

              {/* Marks inputs */}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="space-y-2">
                  <label className={labelClass} htmlFor="qg-total">
                    Total Marks
                  </label>
                  <input
                    id="qg-total"
                    type="number"
                    min="1"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className={labelClass} htmlFor="qg-two">
                    2-mark questions
                  </label>
                  <input
                    id="qg-two"
                    type="number"
                    min="0"
                    value={twoMarkCount}
                    onChange={(e) => setTwoMarkCount(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className={labelClass} htmlFor="qg-sixteen">
                    16-mark questions
                  </label>
                  <input
                    id="qg-sixteen"
                    type="number"
                    min="0"
                    value={sixteenMarkCount}
                    onChange={(e) => setSixteenMarkCount(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Distribution check */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-700">Distribution total</span>
                  <span
                    className={`font-bold ${
                      distributionTotal === Number(totalMarks)
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {distributionTotal} / {totalMarks}
                  </span>
                </div>
                {distributionTotal !== Number(totalMarks) && (
                  <p className="mt-1 text-xs text-rose-500">
                    ({twoMarkCount} × 2) + ({sixteenMarkCount} × 16) = {distributionTotal} ≠ {totalMarks}
                  </p>
                )}
              </div>

              {/* 16-mark split toggle */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                  <span>Enable 16-mark splitting</span>
                  <input
                    type="checkbox"
                    checked={splitEnabled}
                    onChange={(e) => setSplitEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                  />
                </label>

                {splitEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "2parts", label: "2 parts (8 + 8)" },
                      { value: "3parts", label: "3 parts (5 + 5 + 6)" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSplitType(opt.value)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          splitType === opt.value
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <label className={labelClass} htmlFor="qg-difficulty">
                    Difficulty
                  </label>
                  <select
                    id="qg-difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className={inputClass}
                  >
                    <option value="mixed">Mixed</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={labelClass} htmlFor="qg-type">
                    Question Type
                  </label>
                  <select
                    id="qg-type"
                    value={questionType}
                    onChange={(e) => setQuestionType(e.target.value)}
                    className={inputClass}
                  >
                    <option value="mixed">Mixed</option>
                    <option value="2mark">2 mark</option>
                    <option value="16mark">16 mark</option>
                  </select>
                </div>
              </div>

              {/* Shuffle toggle */}
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                <span className="inline-flex items-center gap-2">
                  <Shuffle className="h-4 w-4 text-indigo-500" />
                  Shuffle questions
                </span>
                <input
                  type="checkbox"
                  checked={shuffle}
                  onChange={(e) => setShuffle(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                />
              </label>

              {/* Generate button */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="h-4 w-4" />
                )}
                {generating ? "Generating…" : "Generate Preview"}
              </button>

              {!canGenerate && !generating && (
                <p className="text-center text-xs text-slate-400">
                  {selectedPaperIds.length < 2
                    ? `Select ${2 - selectedPaperIds.length} more paper(s)`
                    : distributionTotal !== Number(totalMarks)
                    ? "Fix marks distribution to match total"
                    : ""}
                </p>
              )}
            </>
        </section>

        {/* ── Right panel: Preview ── */}
        <section className="min-h-140 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <p className={labelClass}>Preview</p>
              <h3 className="text-base font-bold text-slate-950">
                {generatedQuiz ? "Generated Quiz Paper" : "Quiz Paper Template"}
              </h3>
            </div>
            {generatedQuiz && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportWord}
                  className={smallButtonClass}
                >
                  <FileDown className="h-4 w-4" />
                  Export Word
                </button>
                <button
                  type="button"
                  onClick={() => exportToPdf(generatedQuiz)}
                  className={smallButtonClass}
                >
                  <FileDown className="h-4 w-4" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>

          {/* Status / error banners */}
          {errorMessage && (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {errorMessage}
            </div>
          )}
          {statusMessage && (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {statusMessage}
            </div>
          )}

          {generatedQuiz ? (
            /* Generated quiz preview */
            <div className="px-4 py-4">
              <div className="grid gap-3 border-b border-slate-100 pb-4 sm:grid-cols-3">
                <div>
                  <p className={labelClass}>Total</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{previewTotal} Marks</p>
                </div>
                <div>
                  <p className={labelClass}>Sources</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {generatedQuiz.sourcePapers.length} Papers
                  </p>
                </div>
                <div>
                  <p className={labelClass}>Questions</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {generatedQuiz.sections.sectionA.length +
                      generatedQuiz.sections.sectionB.length}{" "}
                    Qs
                  </p>
                </div>
              </div>

              {/* Section A */}
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 rounded-t-xl border border-b-0 border-indigo-100 bg-indigo-50 px-3 py-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                    PART – A
                  </h4>
                  <span className="text-xs font-semibold text-indigo-500">
                    {generatedQuiz.sections.sectionA.length} × 2 = {generatedQuiz.sections.sectionA.length * 2} marks
                  </span>
                </div>
                <div className="divide-y-2 divide-slate-200 rounded-b-xl border border-slate-200 px-3">
                  {generatedQuiz.sections.sectionA.map((q, idx) => (
                    <PreviewQuestion
                      key={`${q.id}-a-${idx}`}
                      question={q}
                      number={idx + 1}
                    />
                  ))}
                </div>
              </div>

              {/* Divider between sections */}
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-300" />
                <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Part B
                </span>
                <div className="h-px flex-1 bg-slate-300" />
              </div>

              {/* Section B */}
              <div>
                <div className="flex items-center justify-between gap-3 rounded-t-xl border border-b-0 border-amber-100 bg-amber-50 px-3 py-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-amber-700">
                    PART – B
                  </h4>
                  <span className="text-xs font-semibold text-amber-600">
                    {getSixteenGroupCount(generatedQuiz)} × 16 = {getSixteenGroupCount(generatedQuiz) * 16} marks
                  </span>
                </div>
                <div className="divide-y-2 divide-slate-200 rounded-b-xl border border-slate-200 px-3">
                  {generatedQuiz.sections.sectionB.map((q, idx) => (
                    <PreviewQuestion
                      key={`${q.id}-b-${idx}`}
                      question={q}
                      number={
                        q.orGroup
                          ? `${q.orGroup} (${q.orOption})`
                          : generatedQuiz.sections.sectionA.length + idx + 1
                      }
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGeneratedQuiz(null)}
                className="mt-6 text-xs text-slate-400 underline hover:text-slate-600"
              >
                Back to template view
              </button>
            </div>
          ) : (
            /* Template preview — paged viewer */
            <div className="flex min-h-140 flex-col">
              <TemplatePagedViewer content={templateContent} loading={templateLoading} />

              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <p className="mb-2 text-center text-xs text-slate-500">
                  Configure options on the left, then generate your quiz paper
                </p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  {generating ? "Generating…" : "Generate from Template"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  if (renderAsPage) {
    return (
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
        {panelContent}
      </section>
    );
  }

  return (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Quiz paper generator">
      <button
        type="button"
        aria-label="Close quiz paper generator"
        onClick={onClose}
        className="ui-modal__scrim"
        tabIndex={-1}
      />
      <div tabIndex={-1} className="ui-modal__panel w-full max-w-6xl">
        {panelContent}
      </div>
    </div>
  );
}
