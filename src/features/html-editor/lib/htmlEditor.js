export const HTML_EDITOR_COLLECTIONS = Object.freeze({
  snippets: "savedHtmlSnippets",
  history: "editorHistory",
  practice: "practiceEditorProgress",
});

export const toSafeHtmlCode = (value) => String(value || "");

export const getHtmlLineNumbers = (value) =>
  Array.from({ length: Math.max(1, toSafeHtmlCode(value).split("\n").length) }, (_, index) =>
    String(index + 1)
  ).join("\n");

export const buildDownloadFileName = (title = "html-practice") => {
  const safeTitle = String(title || "html-practice")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeTitle || "html-practice"}.html`;
};

const tagCount = (code, pattern) => {
  const matches = toSafeHtmlCode(code).match(pattern);
  return matches ? matches.length : 0;
};

export const getHtmlValidationHints = (code) => {
  const safeCode = toSafeHtmlCode(code);
  const hints = [];

  if (!safeCode.trim()) {
    return ["Start by writing a small HTML snippet or load an example."];
  }

  if (!/<!doctype html>/i.test(safeCode)) {
    hints.push("Add <!DOCTYPE html> at the top for a complete HTML page.");
  }

  if (!/<html[\s>]/i.test(safeCode)) {
    hints.push("A full page usually includes an <html> tag.");
  }

  if (!/<body[\s>]/i.test(safeCode)) {
    hints.push("Put visible page content inside a <body> tag.");
  }

  const trackedTags = [
    "html",
    "head",
    "body",
    "div",
    "p",
    "a",
    "ul",
    "li",
    "table",
    "tr",
    "td",
    "th",
    "form",
    "label",
    "button",
  ];

  trackedTags.forEach((tag) => {
    const openCount = tagCount(safeCode, new RegExp(`<${tag}(\\s|>)`, "gi"));
    const closeCount = tagCount(safeCode, new RegExp(`</${tag}>`, "gi"));

    if (openCount > closeCount) {
      hints.push(`Check whether the <${tag}> tag is missing a closing </${tag}> tag.`);
    }
  });

  if (/<img(?![^>]*\salt=)[^>]*>/i.test(safeCode)) {
    hints.push("Add alt text to image tags so the page stays accessible.");
  }

  if (/<a(?![^>]*\shref=)[^>]*>/i.test(safeCode)) {
    hints.push("Add an href attribute to anchor tags so the link has a destination.");
  }

  return hints.slice(0, 4);
};

export const downloadHtmlCode = ({ code, title }) => {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([toSafeHtmlCode(code)], { type: "text/html;charset=utf-8" });
  const href = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = buildDownloadFileName(title);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(href);
};
