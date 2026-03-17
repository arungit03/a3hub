export const extractJsonPayload = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw;

  try {
    return JSON.parse(candidate);
  } catch {
    // Continue with best-effort extraction.
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const objectSlice = candidate.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(objectSlice);
    } catch {
      // Ignore parse error and try array extraction.
    }
  }

  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const arraySlice = candidate.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(arraySlice);
    } catch {
      return null;
    }
  }

  return null;
};

const toSentenceLines = (value) => {
  const raw = String(value || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .trim();
  if (!raw) return [];

  const explicitLines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicitLines.length >= 3) return explicitLines.slice(0, 5);

  const sentenceMatches = raw.match(/[^.!?]+[.!?]?/g) || [];
  const sentenceLines = sentenceMatches
    .map((line) => line.trim())
    .filter(Boolean);
  if (sentenceLines.length >= 3) return sentenceLines.slice(0, 5);

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  const chunks = 3;
  const wordsPerLine = Math.max(1, Math.ceil(words.length / chunks));
  for (let index = 0; index < words.length; index += wordsPerLine) {
    lines.push(words.slice(index, index + wordsPerLine).join(" "));
    if (lines.length === 5) break;
  }
  return lines;
};

export const normalizeTopTechnicalNews = (value, count) => {
  const fallbackList = Array.isArray(value?.topics)
    ? value.topics
    : Array.isArray(value?.news)
    ? value.news
    : Array.isArray(value)
    ? value
    : [];

  return fallbackList
    .map((item) => {
      const title = String(item?.title || item?.headline || "").trim();
      const summaryLines = toSentenceLines(
        item?.summary || item?.description || item?.details
      );
      const summary = summaryLines.slice(0, 5).join("\n");
      const source = String(item?.source || item?.publisher || "").trim();
      const sourceUrl = String(item?.sourceUrl || item?.url || item?.link || "").trim();

      if (!title || !summary) return null;

      return {
        title,
        summary,
        source,
        sourceUrl,
      };
    })
    .filter(Boolean)
    .slice(0, count);
};

const toSingleLine = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toLineList = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const normalizeInterviewQaEntries = (value) => {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
    ? Object.entries(value).map(([question, answer]) => ({
        question,
        answer,
      }))
    : typeof value === "string"
    ? toLineList(value)
    : [];

  return list
    .map((item, index) => {
      if (typeof item === "string") {
        const line = toSingleLine(item);
        if (!line) return null;

        const labelledMatch = line.match(
          /^q(?:uestion)?\s*\d*\s*[:.)-]?\s*(.+?)\s*a(?:nswer)?\s*[:.)-]\s*(.+)$/i
        );
        if (labelledMatch) {
          return {
            question: toSingleLine(labelledMatch[1]) || `Question ${index + 1}`,
            answer: toSingleLine(labelledMatch[2]),
          };
        }

        const splitMatch = line.match(/^(.+?)\s*(?:-|:|â€“|â€”)\s*(.+)$/);
        if (splitMatch) {
          return {
            question: toSingleLine(splitMatch[1]) || `Question ${index + 1}`,
            answer: toSingleLine(splitMatch[2]),
          };
        }

        return {
          question: `Question ${index + 1}`,
          answer: line,
        };
      }

      if (item !== null && typeof item !== "object") {
        const answer = toSingleLine(item);
        if (!answer) return null;
        return {
          question: `Question ${index + 1}`,
          answer,
        };
      }

      const question = toSingleLine(
        item?.question ||
          item?.q ||
          item?.prompt ||
          item?.title ||
          item?.questionText ||
          `Question ${index + 1}`
      );
      const answer = toSingleLine(
        item?.answer ||
          item?.a ||
          item?.explanation ||
          item?.response ||
          item?.solution ||
          item?.details ||
          item?.answerText
      );
      if (!answer) return null;

      return {
        question: question || `Question ${index + 1}`,
        answer,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
};

const toNamedObjectEntries = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).filter(([key]) => String(key || "").trim().length > 0);
};

const normalizeCompanyList = (value) => {
  if (Array.isArray(value?.companies)) return value.companies;
  if (Array.isArray(value?.topCompanies)) return value.topCompanies;
  if (Array.isArray(value?.interviewQuiz)) return value.interviewQuiz;
  if (Array.isArray(value)) return value;

  const companyMap =
    (value?.companies &&
      typeof value.companies === "object" &&
      !Array.isArray(value.companies) &&
      value.companies) ||
    (value?.topCompanies &&
      typeof value.topCompanies === "object" &&
      !Array.isArray(value.topCompanies) &&
      value.topCompanies) ||
    (value?.interviewQuiz &&
      typeof value.interviewQuiz === "object" &&
      !Array.isArray(value.interviewQuiz) &&
      value.interviewQuiz);

  if (companyMap) {
    return toNamedObjectEntries(companyMap).map(([company, details]) =>
      details && typeof details === "object" && !Array.isArray(details)
        ? { company, ...details }
        : { company, qa: details }
    );
  }

  const fallbackEntries = toNamedObjectEntries(value).filter(([key]) => {
    const normalized = key.toLowerCase();
    return ![
      "companies",
      "topcompanies",
      "interviewquiz",
      "contactplaces",
      "interviewcontactplaces",
      "places",
      "generatedat",
      "date",
      "model",
    ].includes(normalized);
  });

  return fallbackEntries.map(([company, details]) =>
    details && typeof details === "object" && !Array.isArray(details)
      ? { company, ...details }
      : { company, qa: details }
  );
};

const normalizeContactPlaceList = (value) => {
  if (Array.isArray(value?.contactPlaces)) return value.contactPlaces;
  if (Array.isArray(value?.interviewContactPlaces)) return value.interviewContactPlaces;
  if (Array.isArray(value?.places)) return value.places;

  const placeMap =
    (value?.contactPlaces &&
      typeof value.contactPlaces === "object" &&
      !Array.isArray(value.contactPlaces) &&
      value.contactPlaces) ||
    (value?.interviewContactPlaces &&
      typeof value.interviewContactPlaces === "object" &&
      !Array.isArray(value.interviewContactPlaces) &&
      value.interviewContactPlaces) ||
    (value?.places &&
      typeof value.places === "object" &&
      !Array.isArray(value.places) &&
      value.places);

  if (placeMap) {
    return toNamedObjectEntries(placeMap).map(([place, details]) =>
      details && typeof details === "object" && !Array.isArray(details)
        ? { place, ...details }
        : { place, description: details }
    );
  }

  return [];
};

export const normalizeInterviewQuizAndContactPlaces = ({
  value,
  companyCount,
  placeCount,
}) => {
  const normalizedCompanies = normalizeCompanyList(value)
    .map((entry, index) => {
      const company = toSingleLine(
        entry?.company || entry?.name || entry?.title || `Company ${index + 1}`
      );
      const quizTopic = toSingleLine(
        entry?.quizTopic || entry?.topic || entry?.category || company
      );
      const qa = normalizeInterviewQaEntries(
        entry?.qa || entry?.questions || entry?.answers || entry
      );

      if (!company || qa.length === 0) return null;

      return {
        company,
        quizTopic: quizTopic || company,
        qa,
      };
    })
    .filter(Boolean)
    .slice(0, companyCount);

  const normalizedContactPlaces = normalizeContactPlaceList(value)
    .map((entry, index) => {
      const place = toSingleLine(
        entry?.place || entry?.name || entry?.title || `Place ${index + 1}`
      );
      const city = toSingleLine(entry?.city || entry?.district || entry?.location);
      const description = toSingleLine(
        entry?.description || entry?.details || entry?.summary || entry?.about
      );

      if (!place || !description) return null;

      return {
        place,
        city,
        description,
      };
    })
    .filter(Boolean)
    .slice(0, placeCount);

  return {
    companies: normalizedCompanies,
    contactPlaces: normalizedContactPlaces,
  };
};
