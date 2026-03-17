import { unstable_usePrompt as usePrompt, useBeforeUnload } from "react-router-dom";

/**
 * @param {unknown} when
 * @param {string} [message]
 */
export function useDirtyPrompt(
  when,
  message = "You have unsaved changes. Leave this page?"
) {
  const shouldWarn = Boolean(when);

  useBeforeUnload(
    (event) => {
      if (!shouldWarn) return;
      event.preventDefault();
      event.returnValue = message;
    },
    { capture: true }
  );

  usePrompt({
    when: shouldWarn,
    message,
  });
}
