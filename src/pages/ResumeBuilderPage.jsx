import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileText,
  Palette,
  Plus,
  Save as SaveIcon,
  Sparkles,
  Trash2,
} from "lucide-react";
import Card from "../components/Card";
import { getGeminiApiKey, requestGeminiChat } from "../lib/geminiClient";
import { useAuth } from "../state/auth";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "summary", label: "Summary" },
  { id: "interests", label: "Interests" },
  { id: "photo", label: "Photo" },
];

const TEMPLATE_OPTIONS = [
  { id: "mark", label: "MARK" },
  { id: "lana", label: "LANA" },
  { id: "blogger", label: "BLOGGER" },
  { id: "bela", label: "BELA" },
  { id: "basic", label: "BASIC" },
];

const DEFAULT_TEMPLATE_COLOR = "#ed6a5a";
const TEMPLATE_COLOR_OPTIONS = [
  { id: "coral", label: "Coral", hex: "#ed6a5a" },
  { id: "rose", label: "Rose", hex: "#fb6f92" },
  { id: "lilac", label: "Lilac", hex: "#bdb2ff" },
  { id: "copper", label: "Copper", hex: "#a98467" },
  { id: "ocean", label: "Ocean", hex: "#5aa9e6" },
];

const DEGREE_OPTIONS = [
  "Select",
  "SSLC",
  "HSC",
  "Diploma",
  "B.E / B.Tech",
  "B.Sc",
  "B.Com",
  "BBA",
  "M.E / M.Tech",
  "M.Sc",
  "MBA",
  "Ph.D",
];

const SKILL_LEVEL_OPTIONS = ["Select", "Beginner", "Intermediate", "Advanced", "Expert"];

const EMPTY_PROFILE = {
  firstName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  maritalStatus: "",
  profession: "",
  streetAddress: "",
  city: "",
  state: "",
  nationality: "",
  passportNumber: "",
  phone: "",
  email: "",
};

const EMPTY_SOCIAL = {
  facebook: "",
  twitter: "",
  linkedin: "",
  website: "",
};

const mkExp = () => ({
  jobTitle: "",
  employer: "",
  city: "",
  state: "",
  startDate: "",
  endDate: "",
  currentlyWorkHere: false,
  description: "",
});
const mkEdu = () => ({
  schoolName: "",
  city: "",
  state: "",
  degree: "",
  fieldOfStudy: "",
  startDate: "",
  endDate: "",
  currentlyStudyHere: false,
});
const mkSkill = () => ({ name: "", level: "" });
const mkInterest = () => ({ name: "" });

const inputClassName =
  "w-full rounded-xl border border-ocean/38 bg-white/92 px-3 py-2 text-sm text-ink placeholder:text-ink/55 focus-visible:border-aurora/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/20";
const labelClassName = "text-xs font-semibold uppercase tracking-[0.16em] text-ink/72";

const toSafeText = (v) => String(v || "").trim();
const isHexColor = (value) => /^#([0-9a-fA-F]{6})$/.test(String(value || "").trim());
const normalizeHexColor = (value, fallback = DEFAULT_TEMPLATE_COLOR) =>
  isHexColor(value) ? String(value).trim() : fallback;
const hexToRgb = (value) => {
  const safe = normalizeHexColor(value);
  return {
    r: parseInt(safe.slice(1, 3), 16),
    g: parseInt(safe.slice(3, 5), 16),
    b: parseInt(safe.slice(5, 7), 16),
  };
};
const toRgba = (value, alpha) => {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const fullName = (p) => [p.firstName, p.lastName].map(toSafeText).filter(Boolean).join(" ");
const makeStorageKey = (uid) => `ckcethub:resume-builder:${uid || "guest"}`;
const sanitizeFileName = (value) =>
  (String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase() || "resume");

const parseAiLines = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .split(/\n|,/)
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);

const splitMultiline = (value) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

const isCanvasLikelyBlank = (canvas) => {
  const ctx = canvas?.getContext?.("2d", { willReadFrequently: true });
  if (!ctx || !canvas?.width || !canvas?.height) return true;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const stepX = Math.max(1, Math.floor(width / 42));
  const stepY = Math.max(1, Math.floor(height / 42));
  let nonWhite = 0;
  let samples = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a > 12 && !(r > 246 && g > 246 && b > 246)) nonWhite += 1;
      samples += 1;
    }
  }
  return samples ? nonWhite / samples < 0.01 : true;
};

const inlineComputedStyles = (sourceRoot, cloneRoot) => {
  if (typeof window === "undefined") return;
  const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
  const cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll("*")];
  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    const computed = window.getComputedStyle(sourceNode);
    if (cloneNode instanceof Element) {
      cloneNode.removeAttribute("class");
    }
    for (const prop of computed) {
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      if (
        value.includes("oklab(") ||
        value.includes("oklch(") ||
        value.includes("color-mix(")
      ) {
        continue;
      }
      try {
        cloneNode.style.setProperty(prop, value, computed.getPropertyPriority(prop));
      } catch {
        // Ignore unsupported style values when copying computed CSS.
      }
    }
  });
};

const PREVIEW_THEME = {
  mark: {
    frame: "border-rose-200",
    header: "bg-rose-50",
    rule: "border-rose-200",
    pill: "bg-rose-100 text-rose-700",
  },
  lana: {
    frame: "border-sky-200",
    header: "bg-sky-50",
    rule: "border-sky-200",
    pill: "bg-sky-100 text-sky-700",
  },
  blogger: {
    frame: "border-slate-300",
    header: "bg-slate-50",
    rule: "border-slate-200",
    pill: "bg-red-100 text-red-700",
  },
  bela: {
    frame: "border-indigo-200",
    header: "bg-indigo-50",
    rule: "border-indigo-200",
    pill: "bg-indigo-100 text-indigo-700",
  },
  basic: {
    frame: "border-zinc-300",
    header: "bg-zinc-50",
    rule: "border-zinc-200",
    pill: "bg-zinc-200 text-zinc-700",
  },
  default: {
    frame: "border-clay/50",
    header: "bg-sand/35",
    rule: "border-clay/45",
    pill: "bg-ocean/12 text-ink",
  },
};

const TEMPLATE_CARD_META = {
  mark: {
    tint: "from-rose-100 via-rose-50 to-white",
    accent: "bg-rose-300",
    line: "bg-rose-200",
    info: "Classic left-column layout",
    structure: "Left sidebar + main content",
  },
  lana: {
    tint: "from-sky-100 via-sky-50 to-white",
    accent: "bg-sky-300",
    line: "bg-sky-200",
    info: "Balanced modern layout",
    structure: "Top header + 2 columns",
  },
  blogger: {
    tint: "from-rose-100 via-rose-50 to-white",
    accent: "bg-rose-300",
    line: "bg-rose-200",
    info: "Bold editorial style",
    structure: "Hero bar + stacked sections",
  },
  bela: {
    tint: "from-sky-100 via-sky-50 to-white",
    accent: "bg-sky-300",
    line: "bg-sky-200",
    info: "Simple clean profile",
    structure: "Split profile + content",
  },
  basic: {
    tint: "from-sky-100 via-sky-50 to-white",
    accent: "bg-sky-300",
    line: "bg-sky-200",
    info: "Minimal business format",
    structure: "Single-column professional",
  },
  default: {
    tint: "from-sand/50 via-cream/80 to-white",
    accent: "bg-clay/65",
    line: "bg-clay/35",
    badge: "bg-sand text-ink",
    info: "Professional resume layout",
    structure: "Standard resume layout",
  },
};

const TEMPLATE_PREVIEW_ACCENTS = {
  mark: {
    deep: "#ec4899",
    mid: "#f9a8d4",
    soft: "#fbcfe8",
    faint: "rgba(236, 72, 153, 0.12)",
  },
  lana: {
    deep: "#06b6d4",
    mid: "#93c5fd",
    soft: "#bfdbfe",
    faint: "rgba(14, 165, 233, 0.12)",
  },
  blogger: {
    deep: "#ec4899",
    mid: "#f9a8d4",
    soft: "#fbcfe8",
    faint: "rgba(236, 72, 153, 0.12)",
  },
  bela: {
    deep: "#06b6d4",
    mid: "#93c5fd",
    soft: "#bfdbfe",
    faint: "rgba(14, 165, 233, 0.12)",
  },
  basic: {
    deep: "#06b6d4",
    mid: "#93c5fd",
    soft: "#bfdbfe",
    faint: "rgba(14, 165, 233, 0.12)",
  },
  default: {
    deep: "#64748b",
    mid: "#cbd5e1",
    soft: "#e2e8f0",
    faint: "rgba(100, 116, 139, 0.12)",
  },
};

function TemplateStructurePreview({ templateId }) {
  const palette = TEMPLATE_PREVIEW_ACCENTS[templateId] || TEMPLATE_PREVIEW_ACCENTS.default;
  const { deep, mid, soft, faint } = palette;

  if (templateId === "mark") {
    return (
      <div className="relative h-44 overflow-hidden rounded-2xl border border-white/85 bg-white/90 p-5 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-[28%]" style={{ backgroundColor: faint }} />
        <div className="absolute left-5 top-7 h-12 w-12 rounded-lg" style={{ backgroundColor: deep }} />
        <div className="absolute left-[34%] top-7 h-3 w-[46%] rounded-full" style={{ backgroundColor: mid }} />
        <div className="absolute left-[34%] top-14 h-3 w-[60%] rounded-full" style={{ backgroundColor: soft }} />
        <div className="absolute left-[34%] top-[5.25rem] h-3 w-[52%] rounded-full" style={{ backgroundColor: soft }} />
      </div>
    );
  }

  if (templateId === "lana") {
    return (
      <div className="relative h-44 overflow-hidden rounded-2xl border border-white/85 bg-white/90 p-5 shadow-sm">
        <div className="absolute left-5 right-5 top-8 h-3 rounded-full" style={{ backgroundColor: deep }} />
        <div className="absolute left-5 top-16 h-2.5 w-[32%] rounded-full" style={{ backgroundColor: mid }} />
        <div className="absolute left-[42%] top-16 h-2.5 w-[52%] rounded-full" style={{ backgroundColor: mid }} />
        <div className="absolute left-5 top-[5.5rem] h-2.5 w-[30%] rounded-full" style={{ backgroundColor: soft }} />
        <div className="absolute left-[42%] top-[5.5rem] h-2.5 w-[28%] rounded-full" style={{ backgroundColor: soft }} />
      </div>
    );
  }

  if (templateId === "blogger") {
    return (
      <div className="relative h-44 overflow-hidden rounded-2xl border border-white/85 bg-white/90 p-5 shadow-sm">
        <div className="absolute left-5 right-5 top-8 h-4 rounded-md" style={{ backgroundColor: deep }} />
        <div className="absolute left-5 top-[4.5rem] h-3 w-[66%] rounded-full" style={{ backgroundColor: mid }} />
        <div className="absolute left-5 top-[6.5rem] h-3 w-[58%] rounded-full" style={{ backgroundColor: soft }} />
        <div className="absolute left-5 top-[8.5rem] h-3 w-[50%] rounded-full" style={{ backgroundColor: soft }} />
      </div>
    );
  }

  if (templateId === "bela") {
    return (
      <div className="relative h-44 overflow-hidden rounded-2xl border border-white/85 bg-white/90 p-5 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-[30%]" style={{ backgroundColor: faint }} />
        <div className="absolute left-5 top-[4.5rem] h-12 w-12 rounded-lg" style={{ backgroundColor: deep }} />
        <div className="absolute left-[38%] top-[4.5rem] h-3 w-[50%] rounded-full" style={{ backgroundColor: mid }} />
        <div className="absolute left-[38%] top-[6.5rem] h-3 w-[40%] rounded-full" style={{ backgroundColor: soft }} />
        <div className="absolute left-5 top-[8.5rem] h-2.5 w-[14%] rounded-full" style={{ backgroundColor: soft }} />
      </div>
    );
  }

  return (
    <div className="relative h-44 overflow-hidden rounded-2xl border border-white/85 bg-white/90 p-5 shadow-sm">
      <div className="absolute left-5 top-8 h-3 w-[42%] rounded-full" style={{ backgroundColor: deep }} />
      <div className="absolute left-5 top-20 h-2.5 w-[70%] rounded-full" style={{ backgroundColor: mid }} />
      <div className="absolute left-5 top-[6.75rem] h-2.5 w-[62%] rounded-full" style={{ backgroundColor: soft }} />
      <div className="absolute left-5 top-[8.5rem] h-2.5 w-[54%] rounded-full" style={{ backgroundColor: soft }} />
    </div>
  );
}

const normalizeResume = (value) => {
  const src = value && typeof value === "object" ? value : {};
  const savedTemplateId = toSafeText(src.templateId);
  const validTemplate = TEMPLATE_OPTIONS.some((item) => item.id === savedTemplateId);
  return {
    id: src.id || `resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: toSafeText(src.title) || "Untitled Resume",
    templateId: validTemplate ? savedTemplateId : "",
    templateColor: normalizeHexColor(src.templateColor, DEFAULT_TEMPLATE_COLOR),
    templateSelected:
      typeof src.templateSelected === "boolean"
        ? src.templateSelected
        : validTemplate,
    profile: { ...EMPTY_PROFILE, ...(src.profile || {}) },
    experience: Array.isArray(src.experience) && src.experience.length ? src.experience : [mkExp()],
    education: Array.isArray(src.education) && src.education.length ? src.education : [mkEdu()],
    skills: Array.isArray(src.skills) && src.skills.length ? src.skills : [mkSkill()],
    summaryText: toSafeText(src.summaryText || src.summary),
    interests: Array.isArray(src.interests) && src.interests.length ? src.interests : [mkInterest()],
    socialLinks: { ...EMPTY_SOCIAL, ...(src.socialLinks || {}) },
    photoDataUrl: toSafeText(src.photoDataUrl),
    createdAt: Number(src.createdAt || Date.now()),
    updatedAt: Number(src.updatedAt || Date.now()),
  };
};

export default function ResumeBuilderPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const apiKey = useMemo(() => getGeminiApiKey(), []);
  const [resumes, setResumes] = useState([]);
  const [activeResumeId, setActiveResumeId] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const previewPdfRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(makeStorageKey(user?.uid));
      const parsed = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(parsed) ? parsed.map(normalizeResume) : [];
      next.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setResumes(next);
      setActiveResumeId(next[0]?.id || "");
      setTitleModalOpen(next.length === 0);
    } catch {
      setResumes([]);
      setActiveResumeId("");
      setTitleModalOpen(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(makeStorageKey(user?.uid), JSON.stringify(resumes));
    } catch {
      // Ignore storage quota/private browsing write failures.
    }
  }, [resumes, user?.uid]);

  useEffect(() => {
    setPreviewOpen(false);
  }, [activeResumeId]);

  const activeResume = resumes.find((item) => item.id === activeResumeId) || null;
  const tabIndex = TABS.findIndex((tab) => tab.id === activeTab);
  const isFirstTab = tabIndex <= 0;
  const isLastTab = tabIndex === TABS.length - 1;
  const templateReady = Boolean(activeResume?.templateSelected && activeResume?.templateId);
  const templateColor = normalizeHexColor(activeResume?.templateColor, DEFAULT_TEMPLATE_COLOR);
  const previewTheme = PREVIEW_THEME[activeResume?.templateId] || PREVIEW_THEME.default;

  const buildStudentPrefill = () => {
    const rawName = toSafeText(profile?.name || user?.displayName);
    const nameParts = rawName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
    const phone = toSafeText(
      profile?.studentMobile || profile?.mobile || profile?.phone || ""
    );
    const email = toSafeText(user?.email || profile?.email);
    const profession = toSafeText(profile?.designation || "Student");
    const fieldOfStudy = toSafeText(profile?.department || "");

    return {
      profile: {
        firstName,
        lastName,
        phone,
        email,
        profession,
      },
      fieldOfStudy,
    };
  };

  const mergeMissingProfileFields = (current, incoming) => {
    const next = { ...(current || {}) };
    Object.entries(incoming || {}).forEach(([key, value]) => {
      if (!toSafeText(next[key]) && toSafeText(value)) {
        next[key] = value;
      }
    });
    return next;
  };

  const updateResume = (updater) => {
    if (!activeResumeId) return;
    setResumes((prev) =>
      prev.map((item) => (item.id === activeResumeId ? { ...updater(item), updatedAt: Date.now() } : item))
    );
  };

  const updateListItem = (key, index, patch) =>
    updateResume((resume) => ({
      ...resume,
      [key]: resume[key].map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const removeListItem = (key, index) =>
    updateResume((resume) => ({
      ...resume,
      [key]: resume[key].length > 1 ? resume[key].filter((_, i) => i !== index) : resume[key],
    }));

  const setTemplateColor = (colorHex) => {
    if (!activeResume) return;
    updateResume((resume) => ({
      ...resume,
      templateColor: normalizeHexColor(colorHex, resume.templateColor || DEFAULT_TEMPLATE_COLOR),
    }));
  };

  const selectTemplate = (templateId) => {
    if (!templateId) return;
    const prefill = buildStudentPrefill();
    updateResume((resume) => ({
      ...resume,
      templateId,
      templateColor: normalizeHexColor(resume.templateColor, DEFAULT_TEMPLATE_COLOR),
      templateSelected: true,
      profile: mergeMissingProfileFields(resume.profile, prefill.profile),
      education: resume.education.map((item, index) =>
        index === 0 && !toSafeText(item.fieldOfStudy) && prefill.fieldOfStudy
          ? { ...item, fieldOfStudy: prefill.fieldOfStudy }
          : item
      ),
    }));
    setPreviewOpen(false);
    setActiveTab("profile");
    setStatus("Template selected. Student info loaded.");
    setError("");
  };

  const getMissingRequiredFields = (resume) => {
    if (!resume) return ["Resume"];
    const missing = [];
    const p = resume.profile || EMPTY_PROFILE;
    if (!toSafeText(p.firstName)) missing.push("First Name");
    if (!toSafeText(p.email)) missing.push("Email");
    if (!toSafeText(p.phone)) missing.push("Phone");
    if (!toSafeText(p.profession)) missing.push("Profession");

    const hasEducation = (resume.education || []).some(
      (item) => toSafeText(item.schoolName) && (toSafeText(item.degree) || toSafeText(item.fieldOfStudy))
    );
    if (!hasEducation) missing.push("Education details");

    const hasSkill = (resume.skills || []).some((item) => toSafeText(item.name));
    if (!hasSkill) missing.push("At least one skill");

    if (!toSafeText(resume.summaryText)) missing.push("Summary");
    return missing;
  };

  const openPreview = () => {
    if (!activeResume) return;
    if (!templateReady) {
      setStatus("Select template first to continue.");
      return;
    }
    const missing = getMissingRequiredFields(activeResume);
    if (missing.length) {
      setPreviewOpen(false);
      setStatus("");
      setError(
        `Fill required details before preview: ${missing.slice(0, 6).join(", ")}${
          missing.length > 6 ? ` (+${missing.length - 6} more)` : ""
        }.`
      );
      return;
    }
    setPreviewOpen(true);
    setError("");
    setStatus("Preview ready. Check resume and click Download PDF.");
  };

  const addSection = () => {
    if (!activeResume) return;
    if (!templateReady) {
      setStatus("Select template first to continue.");
      return;
    }
    if (activeTab === "experience") return updateResume((r) => ({ ...r, experience: [...r.experience, mkExp()] }));
    if (activeTab === "education") return updateResume((r) => ({ ...r, education: [...r.education, mkEdu()] }));
    if (activeTab === "skills") return updateResume((r) => ({ ...r, skills: [...r.skills, mkSkill()] }));
    if (activeTab === "interests") return updateResume((r) => ({ ...r, interests: [...r.interests, mkInterest()] }));
    setStatus("Add Section supports Experience, Education, Skills, Interests.");
  };

  const createResume = () => {
    const title = toSafeText(newTitle);
    if (!title) return setError("Enter resume title.");
    const prefill = buildStudentPrefill();
    const draft = normalizeResume({
      title,
      templateId: "",
      templateColor: DEFAULT_TEMPLATE_COLOR,
      templateSelected: false,
      profile: prefill.profile,
      education: [{ ...mkEdu(), fieldOfStudy: prefill.fieldOfStudy }],
    });
    setResumes((prev) => [draft, ...prev]);
    setActiveResumeId(draft.id);
    setPreviewOpen(false);
    setActiveTab("profile");
    setTitleModalOpen(false);
    setNewTitle("");
    setError("");
    setStatus("Resume created. Select template to continue.");
  };

  const closeTitleModal = () => {
    if (resumes.length) {
      setTitleModalOpen(false);
      setError("");
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/home");
  };

  const saveResume = () => {
    if (!activeResume) return;
    updateResume((r) => ({ ...r }));
    setStatus("Resume saved.");
    setError("");
  };

  const deleteResume = () => {
    if (!activeResumeId) return;
    if (!window.confirm("Delete this resume?")) return;
    setPreviewOpen(false);
    setResumes((prev) => {
      const next = prev.filter((item) => item.id !== activeResumeId);
      setActiveResumeId(next[0]?.id || "");
      if (!next.length) setTitleModalOpen(true);
      return next;
    });
  };

  const downloadPdf = async () => {
    if (!activeResume || downloadingPdf) return;
    if (!templateReady) {
      setStatus("Select template first to continue.");
      return;
    }
    const previewElement = previewPdfRef.current;
    if (!previewElement) {
      setError("Open Final Preview and try Download PDF.");
      return;
    }
    setDownloadingPdf(true);
    setStatus("Preparing PDF...");
    setError("");
    try {
      const [{ jsPDF }, html2canvasModule] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = html2canvasModule.default || html2canvasModule;
      const renderScale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

      const captureToCanvas = async (node) => {
        const rect = node.getBoundingClientRect();
        const captureWidth = Math.max(
          1,
          Math.round(rect.width || node.clientWidth || node.scrollWidth || 0)
        );
        const captureHeight = Math.max(
          1,
          Math.round(rect.height || node.clientHeight || node.scrollHeight || 0)
        );
        return html2canvas(node, {
          backgroundColor: "#ffffff",
          scale: renderScale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          foreignObjectRendering: false,
          width: captureWidth,
          height: captureHeight,
          windowWidth: captureWidth,
          windowHeight: captureHeight,
          x: 0,
          y: 0,
          scrollX: -window.scrollX,
          scrollY: -window.scrollY,
        });
      };

      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      let canvas;
      try {
        canvas = await captureToCanvas(previewElement);
        if (isCanvasLikelyBlank(canvas)) {
          throw new Error("Preview capture was blank.");
        }
      } catch {
        const exportRoot = previewElement.cloneNode(true);
        const previewRect = previewElement.getBoundingClientRect();
        inlineComputedStyles(previewElement, exportRoot);
        exportRoot.querySelectorAll("img").forEach((img) => {
          const src = String(img.getAttribute("src") || "");
          if (/^https?:\/\//i.test(src)) {
            img.setAttribute("crossorigin", "anonymous");
          }
        });
        const sandbox = document.createElement("div");
        sandbox.style.position = "fixed";
        sandbox.style.left = "0";
        sandbox.style.top = "0";
        sandbox.style.opacity = "0";
        sandbox.style.pointerEvents = "none";
        sandbox.style.zIndex = "-1";
        sandbox.style.background = "#ffffff";
        sandbox.style.padding = "0";
        sandbox.style.margin = "0";
        sandbox.style.width = `${Math.ceil(previewRect.width)}px`;
        exportRoot.style.width = `${Math.ceil(previewRect.width)}px`;
        exportRoot.style.maxWidth = "none";
        exportRoot.style.margin = "0";
        exportRoot.style.transform = "none";
        sandbox.appendChild(exportRoot);
        document.body.appendChild(sandbox);
        try {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          canvas = await captureToCanvas(exportRoot);
          if (isCanvasLikelyBlank(canvas)) {
            throw new Error("Preview capture empty.");
          }
        } finally {
          document.body.removeChild(sandbox);
        }
      }

      // Export with 1:1 canvas pixel mapping (no downscale) to avoid subtle alignment drift.
      const exportWidthPx = Math.max(1, canvas.width);
      const exportHeightPx = Math.max(1, canvas.height);
      const maxPageHeightPx = 2600;
      const firstPageHeightPx = Math.min(exportHeightPx, maxPageHeightPx);
      const pdf = new jsPDF({
        unit: "px",
        format: [exportWidthPx, firstPageHeightPx],
        hotfixes: ["px_scaling"],
        orientation: exportWidthPx > firstPageHeightPx ? "l" : "p",
      });

      if (exportHeightPx <= maxPageHeightPx) {
        const imageData = canvas.toDataURL("image/png");
        pdf.addImage(imageData, "PNG", 0, 0, exportWidthPx, exportHeightPx, undefined, "FAST");
      } else {
        const sourcePageHeight = maxPageHeightPx;
        let sourceY = 0;
        let pageIndex = 0;

        while (sourceY < canvas.height) {
          const currentSourceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = currentSourceHeight;
          const sliceCtx = sliceCanvas.getContext("2d");
          if (!sliceCtx) throw new Error("Unable to render PDF page.");
          sliceCtx.fillStyle = "#ffffff";
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          sliceCtx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            currentSourceHeight,
            0,
            0,
            sliceCanvas.width,
            sliceCanvas.height
          );

          if (pageIndex > 0) {
            pdf.addPage([exportWidthPx, currentSourceHeight], exportWidthPx > currentSourceHeight ? "l" : "p");
          }
          const sliceImageData = sliceCanvas.toDataURL("image/png");
          pdf.addImage(sliceImageData, "PNG", 0, 0, exportWidthPx, currentSourceHeight, undefined, "FAST");

          sourceY += currentSourceHeight;
          pageIndex += 1;
        }
      }

      pdf.save(`${sanitizeFileName(activeResume.title)}.pdf`);
      setStatus("Preview downloaded as PDF.");
    } catch (e) {
      setStatus("");
      setError(e?.message ? `Unable to export preview PDF: ${e.message}` : "Unable to export preview PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const askAi = async () => {
    if (!activeResume || askingAi) return;
    if (!templateReady) {
      setStatus("Select template first to continue.");
      return;
    }
    if (!apiKey) return setError("AI service is not configured.");
    setAskingAi(true);
    setError("");
    try {
      if (activeTab === "summary") {
        const prompt = [
          "Write student resume summary.",
          "Return 4 short lines only.",
          `Role: ${toSafeText(activeResume.profile.profession) || "Student"}`,
          `Skills: ${activeResume.skills.map((s) => s.name).filter(Boolean).join(", ") || "None"}`,
        ].join("\n");
        const res = await requestGeminiChat({ apiKey, messages: [{ role: "user", text: prompt, payloadText: prompt }] });
        updateResume((r) => ({ ...r, summaryText: toSafeText(res?.text) }));
        setStatus("AI summary generated.");
      } else if (activeTab === "skills") {
        const prompt = `Suggest 5 resume skills for role: ${toSafeText(activeResume.profile.profession) || "Student"}. Return plain lines.`;
        const res = await requestGeminiChat({ apiKey, messages: [{ role: "user", text: prompt, payloadText: prompt }] });
        const names = parseAiLines(res?.text).slice(0, 6);
        if (!names.length) return setError("AI did not return skills.");
        updateResume((r) => ({ ...r, skills: names.map((name) => ({ name, level: "Intermediate" })) }));
        setStatus("AI skills added.");
      } else if (activeTab === "interests") {
        const prompt = "Suggest 4 resume-friendly interests for student. Return plain lines.";
        const res = await requestGeminiChat({ apiKey, messages: [{ role: "user", text: prompt, payloadText: prompt }] });
        const names = parseAiLines(res?.text).slice(0, 6);
        if (!names.length) return setError("AI did not return interests.");
        updateResume((r) => ({ ...r, interests: names.map((name) => ({ name })) }));
        setStatus("AI interests added.");
      } else if (activeTab === "experience") {
        const e = activeResume.experience[0] || mkExp();
        const prompt = `Write 4 resume bullet points for ${toSafeText(e.jobTitle) || "intern"} role at ${toSafeText(e.employer) || "company"}. Return plain lines.`;
        const res = await requestGeminiChat({ apiKey, messages: [{ role: "user", text: prompt, payloadText: prompt }] });
        const lines = parseAiLines(res?.text);
        if (!lines.length) return setError("AI did not return experience points.");
        updateListItem("experience", 0, { description: lines.map((v) => `- ${v}`).join("\n") });
        setStatus("AI points added to first experience.");
      } else {
        setStatus("Ask AI supports Experience, Skills, Summary, Interests.");
      }
    } catch (e) {
      setError(e?.userMessage || e?.message || "AI request failed.");
    } finally {
      setAskingAi(false);
    }
  };

  const uploadPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Upload valid image file.");
    if (file.size > 2 * 1024 * 1024) return setError("Photo should be below 2 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return setError("Unable to read image.");
      updateResume((r) => ({ ...r, photoDataUrl: dataUrl }));
      setStatus("Photo uploaded.");
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const previewProfile = activeResume?.profile || EMPTY_PROFILE;
  const previewExperience = (activeResume?.experience || []).filter(
    (item) =>
      toSafeText(item.jobTitle) ||
      toSafeText(item.employer) ||
      toSafeText(item.description)
  );
  const previewEducation = (activeResume?.education || []).filter(
    (item) =>
      toSafeText(item.schoolName) ||
      toSafeText(item.degree) ||
      toSafeText(item.fieldOfStudy)
  );
  const previewSkills = (activeResume?.skills || []).filter((item) => toSafeText(item.name));
  const previewInterests = (activeResume?.interests || []).filter((item) => toSafeText(item.name));
  const previewSocialLinks = Object.entries(activeResume?.socialLinks || {}).filter(([, value]) =>
    toSafeText(value)
  );
  const activeTemplateLabel =
    TEMPLATE_OPTIONS.find((item) => item.id === activeResume?.templateId)?.label || "TEMPLATE";
  const builderHeader = (
    <section className="relative overflow-hidden rounded-[1.85rem] border border-white/70 bg-white/55 p-5 shadow-soft backdrop-blur-xl sm:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/10 via-indigo-500/8 to-transparent" />
      <div className="relative flex items-start gap-4">
        <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-float sm:h-16 sm:w-16">
          <FileText size={30} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold uppercase tracking-[0.12em] text-blue-700 sm:text-lg">
            CAMPUS HUB
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Resume Builder AI
          </h1>
          <p className="mt-2 text-lg text-ink/75 sm:text-2xl">
            Create, save and download resume PDF
          </p>
        </div>
      </div>
    </section>
  );

  if (!activeResume && !titleModalOpen) {
    return (
      <section className="mx-auto w-full max-w-7xl space-y-4 px-2 sm:px-2.5">
        {builderHeader}
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 px-2 sm:px-2.5">
      {builderHeader}

      <Card className="relative overflow-hidden border border-white/70 bg-white/55 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-blue-100/20 to-indigo-100/18" />
        <div className="relative space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-end">
            <div className="grid gap-1">
              <label className={labelClassName}>Resume Title</label>
              <p className="text-5xl font-bold tracking-tight text-ink">
                {activeResume?.title || "-"}
              </p>
            </div>

            <div className="grid gap-2">
              <label className={labelClassName}>Saved Resumes</label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                <select
                  value={activeResumeId}
                  onChange={(e) => {
                    setActiveResumeId(e.target.value);
                    setPreviewOpen(false);
                  }}
                  className="h-12 w-full rounded-xl border border-clay/45 bg-white/85 px-3 text-lg font-medium text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/25"
                >
                  {resumes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setTitleModalOpen(true)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-ocean/55 bg-gradient-to-r from-blue-500 to-indigo-600 px-5 text-lg font-semibold text-white shadow-float transition hover:-translate-y-0.5"
                >
                  <Plus size={18} />
                  New
                </button>
                <button
                  type="button"
                  onClick={saveResume}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-100/85 px-5 text-lg font-semibold text-emerald-800 shadow-sm transition hover:-translate-y-0.5"
                >
                  <SaveIcon size={18} />
                  Save
                </button>
                <button
                  type="button"
                  onClick={deleteResume}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-100/85 px-5 text-lg font-semibold text-red-700 shadow-sm transition hover:-translate-y-0.5"
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            </div>
          </div>

          {status ? (
            <div className="rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-100/80 to-emerald-50/85 px-4 py-3 text-emerald-900 shadow-sm">
              <p className="inline-flex items-center gap-2 text-lg font-semibold">
                <CheckCircle2 size={20} />
                {status}
              </p>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-2xl border border-red-300/80 bg-red-50/85 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </Card>

      {activeResume ? (
        <Card className="relative mt-4 overflow-hidden border border-white/70 bg-white/55 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-blue-100/18 to-indigo-100/20" />
          <div className="relative">
          {templateReady ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-clay/40 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                {TABS.map((tab) => <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setPreviewOpen(false); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${activeTab === tab.id ? "bg-gradient-to-r from-ocean to-aurora text-white" : "border border-ocean/35 bg-white text-ink/82"}`}>{tab.label}</button>)}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                  style={{
                    borderColor: toRgba(templateColor, 0.35),
                    backgroundColor: toRgba(templateColor, 0.12),
                    color: templateColor,
                  }}
                >
                  {activeTemplateLabel}
                </span>
                {previewOpen ? (
                  <>
                    <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-xl border border-ocean/45 bg-white px-4 py-2 text-sm font-semibold text-ink">Back to Edit</button>
                    <button type="button" onClick={downloadPdf} disabled={downloadingPdf} className="rounded-xl border border-aurora/65 bg-gradient-to-r from-ocean to-aurora px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{downloadingPdf ? "Downloading..." : "Download PDF"}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={addSection} className="rounded-xl border border-red-300 bg-red-500 px-4 py-2 text-sm font-semibold text-white">+ Add Section</button>
                    <button type="button" onClick={askAi} disabled={askingAi} className="rounded-xl border border-ink/35 bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{askingAi ? "Asking..." : "Ask AI"}</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">
                Step 2
              </p>
              <h3 className="mt-1 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
                Select Resume Template
              </h3>
              <p className="mt-2 text-lg text-ink/75 sm:text-2xl">
                Title completed. Compare structure types, choose your color, then continue.
              </p>
            </div>
          )}

          {!templateReady ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-clay/35 bg-white/78 p-4 shadow-sm">
                <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-base">
                  <Palette size={18} />
                  Choose Accent Color
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {TEMPLATE_COLOR_OPTIONS.map((colorItem) => {
                    const selected = templateColor === colorItem.hex;
                    return (
                      <button
                        key={colorItem.id}
                        type="button"
                        onClick={() => setTemplateColor(colorItem.hex)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-base font-semibold transition ${
                          selected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-clay/45 bg-white text-ink/75 hover:bg-sand/70"
                        }`}
                        aria-pressed={selected}
                      >
                        <span
                          className="h-7 w-7 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: colorItem.hex }}
                        />
                        <span
                          className={`h-4 w-4 rounded-full border ${selected ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"}`}
                          aria-hidden="true"
                        />
                        {colorItem.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {TEMPLATE_OPTIONS.map((tpl) => {
                  const meta = TEMPLATE_CARD_META[tpl.id] || TEMPLATE_CARD_META.default;
                  const isSelected = activeResume.templateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => selectTemplate(tpl.id)}
                      className={`rounded-3xl p-0.5 text-left transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/35 ${isSelected ? "ring-2 ring-ocean/45" : ""}`}
                    >
                      <div className={`overflow-hidden rounded-3xl border border-clay/35 bg-gradient-to-br ${meta.tint}`}>
                        <div className="relative p-4">
                          <TemplateStructurePreview templateId={tpl.id} />
                          <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow">
                            <Sparkles size={13} />
                            AI READY
                          </span>
                        </div>
                        <div className="border-t border-clay/40 bg-white/72 px-4 pb-5 pt-4">
                          <p className="text-4xl font-bold tracking-tight text-ink">{tpl.label}</p>
                          <p className="mt-1 text-2xl font-semibold text-ink/80">{meta.structure}</p>
                          <p className="mt-1 text-lg text-ink/65">{meta.info}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          </div>

          {templateReady ? (
            previewOpen ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={labelClassName}>Final Preview</p>
                  <p className="text-lg font-semibold text-ink">Template: {activeTemplateLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-xl border border-ocean/45 bg-white px-4 py-2 text-sm font-semibold text-ink">Edit Details</button>
                  <button type="button" onClick={downloadPdf} disabled={downloadingPdf} className="rounded-xl border border-aurora/65 bg-gradient-to-r from-ocean to-aurora px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{downloadingPdf ? "Downloading..." : "Download PDF"}</button>
                </div>
              </div>

              <div
                ref={previewPdfRef}
                className={`mx-auto w-full max-w-[860px] rounded-2xl border ${previewTheme.frame} bg-white shadow-soft`}
                style={{ borderColor: toRgba(templateColor, 0.34) }}
              >
                <div
                  className={`rounded-t-2xl border-b ${previewTheme.rule} ${previewTheme.header} px-5 py-4`}
                  style={{
                    borderColor: toRgba(templateColor, 0.25),
                    background: `linear-gradient(120deg, ${toRgba(templateColor, 0.16)} 0%, rgba(255,255,255,0.98) 100%)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-bold text-ink">{fullName(previewProfile) || "Student Name"}</h3>
                      <p className="mt-1 text-sm font-medium text-ink/80">{toSafeText(previewProfile.profession) || "Student"}</p>
                      <p className="mt-2 text-sm text-ink/70">{[previewProfile.city, previewProfile.state].filter(Boolean).join(", ") || "Campus Location"}</p>
                      <p className="mt-1 text-sm text-ink/70">{[previewProfile.phone, previewProfile.email].filter(Boolean).join(" | ")}</p>
                    </div>
                    {activeResume.photoDataUrl ? (
                      <img crossOrigin="anonymous" src={activeResume.photoDataUrl} alt="Resume profile" className="h-16 w-16 rounded-xl border border-clay/45 object-cover" />
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-5 px-5 py-4 md:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>SUMMARY</h4>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink/90">{toSafeText(activeResume.summaryText) || "Summary not added yet."}</p>
                    </section>

                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>WORK EXPERIENCE</h4>
                      <div className="mt-2 space-y-3">
                        {previewExperience.length ? previewExperience.map((item, i) => (
                          <div key={`preview-exp-${i}`} className="text-sm text-ink/90">
                            <p className="font-semibold">{[item.jobTitle, item.employer].filter(Boolean).join(" - ") || "Role"}</p>
                            <p className="text-xs text-ink/70">{[item.city, item.state].filter(Boolean).join(", ")}{(item.startDate || item.endDate || item.currentlyWorkHere) ? ` | ${[item.startDate, item.currentlyWorkHere ? "Present" : item.endDate].filter(Boolean).join(" to ")}` : ""}</p>
                            {splitMultiline(item.description).length ? (
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-ink/80">
                                {splitMultiline(item.description).map((line, idx) => (
                                  <li key={`preview-exp-line-${i}-${idx}`}>{line}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        )) : <p className="text-sm text-ink/65">No experience added.</p>}
                      </div>
                    </section>

                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>EDUCATION</h4>
                      <div className="mt-2 space-y-2">
                        {previewEducation.length ? previewEducation.map((item, i) => (
                          <div key={`preview-edu-${i}`} className="text-sm text-ink/90">
                            <p className="font-semibold">{item.schoolName || "School Name"}</p>
                            <p className="text-xs text-ink/70">{[item.degree, item.fieldOfStudy].filter(Boolean).join(" - ")}</p>
                            <p className="text-xs text-ink/70">{[item.city, item.state].filter(Boolean).join(", ")}{(item.startDate || item.endDate || item.currentlyStudyHere) ? ` | ${[item.startDate, item.currentlyStudyHere ? "Present" : item.endDate].filter(Boolean).join(" to ")}` : ""}</p>
                          </div>
                        )) : <p className="text-sm text-ink/65">No education details added.</p>}
                      </div>
                    </section>
                  </div>

                  <div className="space-y-4">
                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>SKILLS</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewSkills.length ? previewSkills.map((item, i) => (
                          <span
                            key={`preview-skill-${i}`}
                            className="resume-preview-pill border text-center text-xs font-semibold"
                            style={{
                              borderColor: toRgba(templateColor, 0.3),
                              backgroundColor: toRgba(templateColor, 0.14),
                              color: toRgba(templateColor, 0.96),
                            }}
                          >
                            <span className="resume-preview-pill__label">{item.name}{item.level ? ` (${item.level})` : ""}</span>
                          </span>
                        )) : <p className="text-sm text-ink/65">No skills added.</p>}
                      </div>
                    </section>

                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>INTERESTS</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewInterests.length ? previewInterests.map((item, i) => (
                          <span key={`preview-int-${i}`} className="resume-preview-pill border border-clay/45 bg-sand/35 text-center text-xs font-medium text-ink/85">
                            <span className="resume-preview-pill__label">{item.name}</span>
                          </span>
                        )) : <p className="text-sm text-ink/65">No interests added.</p>}
                      </div>
                    </section>

                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>CONTACT</h4>
                      <div className="mt-2 space-y-1 text-sm text-ink/85">
                        {toSafeText(previewProfile.streetAddress) ? <p>{previewProfile.streetAddress}</p> : null}
                        {toSafeText(previewProfile.nationality) ? <p>Nationality: {previewProfile.nationality}</p> : null}
                        {toSafeText(previewProfile.passportNumber) ? <p>Passport: {previewProfile.passportNumber}</p> : null}
                      </div>
                    </section>

                    <section>
                      <h4 className="border-b pb-1 text-xs font-bold tracking-[0.18em]" style={{ borderColor: toRgba(templateColor, 0.28), color: toRgba(templateColor, 0.9) }}>SOCIAL LINKS</h4>
                      <div className="mt-2 space-y-1 text-xs text-ink/85">
                        {previewSocialLinks.length ? previewSocialLinks.map(([key, value]) => (
                          <p key={`preview-social-${key}`}><span className="font-semibold uppercase">{key}:</span> {value}</p>
                        )) : <p className="text-sm text-ink/65">No social links added.</p>}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
          {activeTab === "profile" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
            ["firstName", "First Name"], ["lastName", "Last Name"],
            ["gender", "Gender"], ["dateOfBirth", "Date of Birth", "date"], ["maritalStatus", "Marital Status"],
            ["profession", "Profession"], ["streetAddress", "Street Address"], ["city", "City"],
            ["state", "State"], ["nationality", "Nationality"], ["passportNumber", "Passport number"],
            ["phone", "Phone"], ["email", "Email", "email"],
          ].map(([key, label, type]) => <div key={key} className={`grid gap-1 ${key === "streetAddress" || key === "profession" || key === "email" ? "lg:col-span-2" : ""}`}><label className={labelClassName}>{label}</label><input type={type || "text"} className={inputClassName} value={activeResume.profile[key] || ""} onChange={(e) => updateResume((r) => ({ ...r, profile: { ...r.profile, [key]: e.target.value } }))} /></div>)}</div> : null}

          {activeTab === "experience" ? <div className="space-y-3">{activeResume.experience.map((item, i) => <div key={`exp-${i}`} className="rounded-2xl border border-clay/45 bg-sand/35 p-3"><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><label className={labelClassName}>Job Title</label><input className={inputClassName} value={item.jobTitle} onChange={(e) => updateListItem("experience", i, { jobTitle: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>Employer</label><input className={inputClassName} value={item.employer} onChange={(e) => updateListItem("experience", i, { employer: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>City</label><input className={inputClassName} value={item.city} onChange={(e) => updateListItem("experience", i, { city: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>State</label><input className={inputClassName} value={item.state} onChange={(e) => updateListItem("experience", i, { state: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>Start Date</label><input type="date" className={inputClassName} value={item.startDate} onChange={(e) => updateListItem("experience", i, { startDate: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>End Date</label><input type="date" disabled={item.currentlyWorkHere} className={`${inputClassName} disabled:opacity-60`} value={item.endDate} onChange={(e) => updateListItem("experience", i, { endDate: e.target.value })} /></div><div className="sm:col-span-2"><label className="inline-flex items-center gap-2 text-sm text-ink/85"><input type="checkbox" checked={Boolean(item.currentlyWorkHere)} onChange={(e) => updateListItem("experience", i, { currentlyWorkHere: e.target.checked, endDate: e.target.checked ? "" : item.endDate })} className="h-4 w-4 rounded" />I currently work here</label></div><div className="grid gap-1 sm:col-span-2"><label className={labelClassName}>Role Highlights</label><textarea className={`${inputClassName} min-h-24`} value={item.description} onChange={(e) => updateListItem("experience", i, { description: e.target.value })} /></div></div><div className="mt-2 flex justify-end"><button type="button" onClick={() => removeListItem("experience", i)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Delete</button></div></div>)}</div> : null}

          {activeTab === "education" ? <div className="space-y-3">{activeResume.education.map((item, i) => <div key={`edu-${i}`} className="rounded-2xl border border-clay/45 bg-sand/35 p-3"><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><label className={labelClassName}>School Name</label><input className={inputClassName} value={item.schoolName} onChange={(e) => updateListItem("education", i, { schoolName: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>City</label><input className={inputClassName} value={item.city} onChange={(e) => updateListItem("education", i, { city: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>State</label><input className={inputClassName} value={item.state} onChange={(e) => updateListItem("education", i, { state: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>Select a Degree</label><select className={inputClassName} value={item.degree} onChange={(e) => updateListItem("education", i, { degree: e.target.value })}>{DEGREE_OPTIONS.map((opt) => <option key={`${i}-${opt}`} value={opt === "Select" ? "" : opt}>{opt}</option>)}</select></div><div className="grid gap-1 sm:col-span-2"><label className={labelClassName}>Field of Study</label><input className={inputClassName} value={item.fieldOfStudy} onChange={(e) => updateListItem("education", i, { fieldOfStudy: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>Graduation Start Date</label><input type="date" className={inputClassName} value={item.startDate} onChange={(e) => updateListItem("education", i, { startDate: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>Graduation End Date</label><input type="date" disabled={item.currentlyStudyHere} className={`${inputClassName} disabled:opacity-60`} value={item.endDate} onChange={(e) => updateListItem("education", i, { endDate: e.target.value })} /></div><div className="sm:col-span-2"><label className="inline-flex items-center gap-2 text-sm text-ink/85"><input type="checkbox" checked={Boolean(item.currentlyStudyHere)} onChange={(e) => updateListItem("education", i, { currentlyStudyHere: e.target.checked, endDate: e.target.checked ? "" : item.endDate })} className="h-4 w-4 rounded" />I currently study here</label></div></div><div className="mt-2 flex justify-end"><button type="button" onClick={() => removeListItem("education", i)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Delete</button></div></div>)}</div> : null}

          {activeTab === "skills" ? <div className="space-y-3">{activeResume.skills.map((item, i) => <div key={`skill-${i}`} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end"><div className="grid gap-1"><label className={labelClassName}>Skill</label><input className={inputClassName} value={item.name} onChange={(e) => updateListItem("skills", i, { name: e.target.value })} /></div><div className="grid gap-1"><label className={labelClassName}>Level</label><select className={inputClassName} value={item.level} onChange={(e) => updateListItem("skills", i, { level: e.target.value })}>{SKILL_LEVEL_OPTIONS.map((opt) => <option key={`${i}-${opt}`} value={opt === "Select" ? "" : opt}>{opt}</option>)}</select></div><button type="button" onClick={() => removeListItem("skills", i)} className="h-10 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700">Delete</button></div>)}</div> : null}

          {activeTab === "summary" ? <div className="grid gap-1"><label className={labelClassName}>Professional Summary</label><textarea className={`${inputClassName} min-h-32`} value={activeResume.summaryText || ""} onChange={(e) => updateResume((r) => ({ ...r, summaryText: e.target.value }))} /></div> : null}

          {activeTab === "interests" ? <div className="space-y-3">{activeResume.interests.map((item, i) => <div key={`interest-${i}`} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div className="grid gap-1"><label className={labelClassName}>Interest</label><input className={inputClassName} value={item.name} onChange={(e) => updateListItem("interests", i, { name: e.target.value })} /></div><button type="button" onClick={() => removeListItem("interests", i)} className="h-10 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700">Delete</button></div>)}</div> : null}

          {activeTab === "photo" ? <div className="grid gap-4 lg:grid-cols-[280px_1fr]"><div className="rounded-2xl border border-clay/45 bg-sand/35 p-3"><div className="mx-auto h-48 w-44 overflow-hidden rounded-xl border border-clay/55 bg-white">{activeResume.photoDataUrl ? <img crossOrigin="anonymous" src={activeResume.photoDataUrl} alt="Resume profile" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-ink/65">No Photo</div>}</div><label className="mt-3 block"><input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" /><span className="block cursor-pointer rounded-xl border border-ocean/45 bg-ocean px-3 py-2 text-center text-sm font-semibold text-white">Upload CV Photo</span></label><p className="mt-2 text-center text-xs text-ink/75">Accept: JPG, GIF, PNG. Max size 2 MB.</p></div><div className="space-y-3"><p className="text-2xl font-semibold text-ink">Add Social Link</p><div className="grid gap-3 sm:grid-cols-2">{[["facebook", "Facebook (Username)", "eg mike.john"], ["twitter", "Twitter (Username)", "eg mycvcreator"], ["linkedin", "LinkedIn (Username)", "eg mycvcreator"], ["website", "Website", "yourwebsite.com"]].map(([key, label, ph]) => <div key={key} className="grid gap-1"><label className={labelClassName}>{label}</label><input className={inputClassName} placeholder={ph} value={activeResume.socialLinks[key] || ""} onChange={(e) => updateResume((r) => ({ ...r, socialLinks: { ...r.socialLinks, [key]: e.target.value } }))} /></div>)}</div></div></div> : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <button type="button" disabled={isFirstTab} onClick={() => !isFirstTab && setActiveTab(TABS[tabIndex - 1].id)} className="rounded-xl border border-ocean/50 bg-white px-5 py-2 text-sm font-semibold text-ink disabled:opacity-50">Previous</button>
            <div className="text-center"><button type="button" onClick={saveResume} className="rounded-xl border border-emerald-600 bg-emerald-500 px-6 py-2 text-sm font-semibold text-white">Save</button></div>
            <button type="button" onClick={() => (isLastTab ? openPreview() : setActiveTab(TABS[tabIndex + 1].id))} className="rounded-xl border border-aurora/65 bg-gradient-to-r from-aurora to-cocoa px-5 py-2 text-sm font-semibold text-white">{isLastTab ? "Final Preview" : "Next"}</button>
          </div>
            </>
          )
          ) : null}
        </Card>
      ) : null}

      {titleModalOpen ? (
        <div
          className="ui-modal ui-modal--compact"
          role="dialog"
          aria-modal="true"
          aria-label="Resume title"
        >
          <button
            type="button"
            aria-label="Close modal"
            onClick={closeTitleModal}
            className="ui-modal__scrim"
            tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-2xl">
            <div className="ui-modal__body">
              <div className="rounded-2xl border border-ocean/35 bg-white/90 p-4 sm:p-5">
                <h3 className="text-3xl font-bold text-ink sm:text-4xl">Enter Resume Title</h3>
                <p className="mt-2 text-sm text-ink/80">This name will be used to save your resume.</p>
                <input autoFocus placeholder="Enter Resume Title" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setError(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createResume(); } }} className="mt-4 w-full rounded-xl border border-ocean/52 bg-white px-4 py-3 text-lg text-ink placeholder:text-ink/50" />
                <div className="mt-4 flex justify-end gap-2 border-t border-clay/45 pt-4">
                  <button type="button" onClick={closeTitleModal} className="rounded-full border border-red-300 bg-red-50 px-6 py-2 text-sm font-semibold text-red-700">Close</button>
                  <button type="button" onClick={createResume} className="rounded-full border border-aurora/65 bg-gradient-to-r from-ocean to-aurora px-6 py-2 text-sm font-semibold text-white">Create</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
