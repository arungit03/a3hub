export const readDraftValue = (storageKey, fallbackValue) => {
  if (typeof window === "undefined") {
    return String(fallbackValue ?? "");
  }

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (typeof saved === "string" && saved.length > 0) {
      return saved;
    }
  } catch {
    // Ignore draft read failures and use fallback content.
  }

  return String(fallbackValue ?? "");
};

export const saveDraftValue = (storageKey, value) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, String(value ?? ""));
  } catch {
    // Ignore storage failures to keep editor responsive.
  }
};

export const copyTextValue = async (value) => {
  const text = String(value ?? "");
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") return false;

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "absolute";
  fallback.style.left = "-9999px";
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
  return true;
};

const DEFAULT_INDENT = "    ";

const toSafePosition = (value, position) => {
  const length = String(value || "").length;
  const numeric = Number(position);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(length, Math.floor(numeric)));
};

const expandSelectionToLines = (value, start, end) => {
  const text = String(value || "");
  const safeStart = Math.min(toSafePosition(text, start), toSafePosition(text, end));
  const safeEnd = Math.max(toSafePosition(text, start), toSafePosition(text, end));
  const lineStart = text.lastIndexOf("\n", safeStart - 1) + 1;
  const anchor =
    safeEnd > safeStart && text[safeEnd - 1] === "\n" ? safeEnd - 1 : safeEnd;
  const newlineIndex = text.indexOf("\n", anchor);
  const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
  return {
    text,
    safeStart,
    safeEnd,
    lineStart,
    lineEnd,
    block: text.slice(lineStart, lineEnd),
  };
};

const removeLeadingIndent = (line, indentUnit) => {
  if (!line) {
    return { nextLine: line, removed: 0 };
  }
  if (line.startsWith(indentUnit)) {
    return { nextLine: line.slice(indentUnit.length), removed: indentUnit.length };
  }
  if (line.startsWith("\t")) {
    return { nextLine: line.slice(1), removed: 1 };
  }
  const spaces = line.match(/^ +/);
  if (spaces) {
    const removed = Math.min(indentUnit.length, spaces[0].length);
    return { nextLine: line.slice(removed), removed };
  }
  return { nextLine: line, removed: 0 };
};

export const applyIndentToText = ({
  value,
  selectionStart,
  selectionEnd,
  indentUnit = DEFAULT_INDENT,
}) => {
  const text = String(value || "");
  const start = toSafePosition(text, selectionStart);
  const end = toSafePosition(text, selectionEnd);

  if (start === end) {
    const nextValue = `${text.slice(0, start)}${indentUnit}${text.slice(end)}`;
    const cursor = start + indentUnit.length;
    return {
      value: nextValue,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  const lineRange = expandSelectionToLines(text, start, end);
  const lines = lineRange.block.split("\n");
  const nextBlock = lines.map((line) => `${indentUnit}${line}`).join("\n");
  const nextValue = `${text.slice(0, lineRange.lineStart)}${nextBlock}${text.slice(
    lineRange.lineEnd
  )}`;

  return {
    value: nextValue,
    selectionStart: start + indentUnit.length,
    selectionEnd: end + indentUnit.length * lines.length,
  };
};

export const applyOutdentToText = ({
  value,
  selectionStart,
  selectionEnd,
  indentUnit = DEFAULT_INDENT,
}) => {
  const text = String(value || "");
  const start = toSafePosition(text, selectionStart);
  const end = toSafePosition(text, selectionEnd);

  if (start === end) {
    const lineRange = expandSelectionToLines(text, start, end);
    const line = lineRange.block;
    const { nextLine, removed } = removeLeadingIndent(line, indentUnit);
    if (removed === 0) {
      return {
        value: text,
        selectionStart: start,
        selectionEnd: end,
      };
    }
    const nextValue = `${text.slice(0, lineRange.lineStart)}${nextLine}${text.slice(
      lineRange.lineEnd
    )}`;
    const cursor = Math.max(lineRange.lineStart, start - removed);
    return {
      value: nextValue,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  const lineRange = expandSelectionToLines(text, start, end);
  const lines = lineRange.block.split("\n");
  let removedTotal = 0;
  let removedFirst = 0;
  const nextLines = lines.map((line, index) => {
    const { nextLine, removed } = removeLeadingIndent(line, indentUnit);
    removedTotal += removed;
    if (index === 0) removedFirst = removed;
    return nextLine;
  });

  const nextBlock = nextLines.join("\n");
  const nextValue = `${text.slice(0, lineRange.lineStart)}${nextBlock}${text.slice(
    lineRange.lineEnd
  )}`;

  return {
    value: nextValue,
    selectionStart: Math.max(lineRange.lineStart, start - removedFirst),
    selectionEnd: Math.max(lineRange.lineStart, end - removedTotal),
  };
};

export const applyToggleLineComment = ({
  value,
  selectionStart,
  selectionEnd,
  commentToken,
}) => {
  const text = String(value || "");
  const token = String(commentToken || "").trim();
  if (!token) {
    return {
      value: text,
      selectionStart: toSafePosition(text, selectionStart),
      selectionEnd: toSafePosition(text, selectionEnd),
    };
  }

  const start = toSafePosition(text, selectionStart);
  const end = toSafePosition(text, selectionEnd);
  const lineRange = expandSelectionToLines(text, start, end);
  const lines = lineRange.block.split("\n");
  const meaningful = lines.filter((line) => line.trim().length > 0);
  const shouldUncomment =
    meaningful.length > 0 &&
    meaningful.every((line) => line.trimStart().startsWith(token));

  const normalizeUncomment = (line) => {
    const indentMatch = line.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : "";
    const rest = line.slice(indent.length);
    if (!rest.startsWith(token)) return line;
    const afterToken = rest.slice(token.length);
    return `${indent}${afterToken.startsWith(" ") ? afterToken.slice(1) : afterToken}`;
  };

  const normalizeComment = (line) => {
    if (!line.trim()) return line;
    const indentMatch = line.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0] : "";
    const rest = line.slice(indent.length);
    return `${indent}${token} ${rest}`;
  };

  const nextLines = lines.map((line) =>
    shouldUncomment ? normalizeUncomment(line) : normalizeComment(line)
  );
  const nextBlock = nextLines.join("\n");
  const nextValue = `${text.slice(0, lineRange.lineStart)}${nextBlock}${text.slice(
    lineRange.lineEnd
  )}`;

  if (start === end) {
    const originalLine = lines[0] || "";
    const nextLine = nextLines[0] || "";
    const column = start - lineRange.lineStart;
    const safeColumn = Math.max(0, Math.min(originalLine.length, column));
    let nextColumn = safeColumn;

    const indentLength = (originalLine.match(/^\s*/) || [""])[0].length;
    const commentLength = token.length + 1;

    if (!shouldUncomment) {
      if (safeColumn >= indentLength) {
        nextColumn = safeColumn + commentLength;
      }
    } else {
      const tokenStart = indentLength;
      const tokenEnd = tokenStart + commentLength;
      if (safeColumn > tokenEnd) {
        nextColumn = safeColumn - commentLength;
      } else if (safeColumn > tokenStart) {
        nextColumn = tokenStart;
      }
    }

    nextColumn = Math.max(0, Math.min(nextLine.length, nextColumn));
    const cursor = lineRange.lineStart + nextColumn;
    return {
      value: nextValue,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  return {
    value: nextValue,
    selectionStart: lineRange.lineStart,
    selectionEnd: lineRange.lineStart + nextBlock.length,
  };
};
