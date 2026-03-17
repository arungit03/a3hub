import { isRouteErrorResponse, useRouteError } from "react-router-dom";

const toErrorMessage = (error) => {
  if (isRouteErrorResponse(error)) {
    return error.statusText || `Request failed with status ${error.status}`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Something went wrong while loading this page.";
};

export default function RouterErrorPage() {
  const error = useRouteError();
  const message = toErrorMessage(error);
  const isChunkError = /Failed to fetch dynamically imported module|ChunkLoadError|Importing a module script failed/i.test(
    message
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4efe6] px-4">
      <div className="w-full max-w-lg rounded-[28px] border border-[#d9cfbf] bg-white/95 p-7 text-[#2b2620] shadow-[0_24px_70px_rgba(43,38,32,0.14)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8f7f69]">
          A3 Hub
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[#1e1914]">
          This page could not load
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#5f5448]">
          {isChunkError
            ? "A fresh deploy likely changed the app files while this tab was open. Reload once to pull the latest build."
            : message}
        </p>
        {!isChunkError && (
          <pre className="mt-4 overflow-x-auto rounded-2xl border border-[#e8dece] bg-[#faf6ef] px-4 py-3 text-xs text-[#6d6255]">
            {message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-full bg-[#1f6f5f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#185748]"
          >
            Reload App
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="inline-flex items-center justify-center rounded-full border border-[#d3c6b4] px-5 py-2.5 text-sm font-semibold text-[#4d4338] transition hover:bg-[#f5eee4]"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}

