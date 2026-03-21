import { useMemo, useState } from "react";
import { buildRemoteImageCandidates } from "../../shared/utils/media.js";

const getFallbackLabel = (value) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "A3";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
};

function RemoteImageFrame({
  candidates,
  alt,
  className,
  fallbackClassName,
  fallbackLabelClassName,
  label,
}) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const resolvedSrc = candidates[attemptIndex] || "";

  if (!resolvedSrc) {
    return (
      <div
        className={fallbackClassName}
        role="img"
        aria-label={alt || "Image unavailable"}
      >
        <span className={fallbackLabelClassName}>{label}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() =>
        setAttemptIndex((currentIndex) =>
          currentIndex + 1 < candidates.length ? currentIndex + 1 : candidates.length
        )
      }
    />
  );
}

export function RemoteImage({
  src,
  alt = "",
  className = "",
  fallbackClassName = "",
  fallbackLabel = "",
  fallbackLabelClassName = "",
}) {
  const candidates = useMemo(() => buildRemoteImageCandidates(src), [src]);
  const label = getFallbackLabel(fallbackLabel || alt);

  return (
    <RemoteImageFrame
      key={candidates.join("|")}
      candidates={candidates}
      alt={alt}
      className={className}
      fallbackClassName={fallbackClassName}
      fallbackLabelClassName={fallbackLabelClassName}
      label={label}
    />
  );
}
