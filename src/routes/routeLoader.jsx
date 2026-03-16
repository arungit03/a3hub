import { Suspense } from "react";

function RouteFallback() {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="rounded-2xl border border-clay/25 bg-cream px-6 py-4 text-sm text-ink/80 shadow-soft">
        Loading page...
      </div>
    </div>
  );
}

export function RouteLoader({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}
