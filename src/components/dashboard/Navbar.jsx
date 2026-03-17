import { useEffect, useRef, useState } from "react";
import NotificationCenter from "../NotificationCenter";
import { isFeatureEnabled } from "../../config/features";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.9",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export default function Navbar({
  userName,
  roleLabel,
  avatarLetter,
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  searchSuggestions = [],
  onSearchSelect,
  onMenuToggle,
  onProfileClick,
}) {
  const notificationsEnabled = isFeatureEnabled("notifications");
  const [searchOpen, setSearchOpen] = useState(() => Boolean(searchTerm));
  const searchInputRef = useRef(null);
  const isSearchVisible = searchOpen || Boolean(searchTerm);
  const trimmedSearchTerm = String(searchTerm || "").trim();
  const showSuggestions = isSearchVisible && trimmedSearchTerm.length > 0;

  useEffect(() => {
    if (!isSearchVisible) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isSearchVisible]);

  const closeSearch = () => {
    onSearchChange?.("");
    setSearchOpen(false);
  };

  const handleSearchSubmitLocal = () => {
    onSearchSubmit?.();
    setSearchOpen(false);
  };

  const handleSearchSuggestionClick = (suggestion) => {
    onSearchSelect?.(suggestion);
    setSearchOpen(false);
  };

  const searchField = (
    <div className="relative">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <svg {...iconProps}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </span>
        <input
          ref={searchInputRef}
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeSearch();
              return;
            }
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            handleSearchSubmitLocal();
          }}
          placeholder="Search students, subjects, notices..."
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-sky-300 focus:bg-white focus:outline-none"
        />
      </label>

      {showSuggestions ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_48px_-28px_rgba(15,23,42,0.35)]">
          {searchSuggestions.length > 0 ? (
            <div className="py-2">
              {searchSuggestions.map((suggestion) => (
                <button
                  key={`${suggestion.id}:${suggestion.search || ""}`}
                  type="button"
                  onClick={() => handleSearchSuggestionClick(suggestion)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {suggestion.label}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {suggestion.search ? "Open matching section" : "Open page"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-sky-600">
                    Open
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500">
              No matching pages found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 backdrop-blur">
      <div className="px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 lg:hidden"
          aria-label="Open sidebar"
        >
          <svg {...iconProps}>
            <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
          </svg>
        </button>

        <div className="min-w-0 flex-1 sm:hidden">
          <p className="truncate text-[1.65rem] font-semibold tracking-tight text-slate-900">
            A3Hub
          </p>
        </div>

        <div className="hidden flex-1 transition-all duration-200 sm:block">
          {isSearchVisible ? (
            searchField
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-slate-500 transition hover:border-slate-300 hover:bg-white"
              aria-label="Open search"
            >
              <span className="text-slate-400">
                <svg {...iconProps}>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
              </span>
              <span className="truncate text-sm font-medium">
                Search students, subjects, notices...
              </span>
            </button>
          )}
        </div>

        {!isSearchVisible ? (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white sm:hidden"
            aria-label="Open search"
          >
            <span className="text-slate-400">
              <svg {...iconProps}>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
            </span>
            <span>Search</span>
          </button>
        ) : null}

        {notificationsEnabled ? (
          <NotificationCenter
            inlineTrigger
            triggerClassName="h-10 w-10 rounded-full shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl"
          />
        ) : null}

        <button
          type="button"
          onClick={onProfileClick}
          className="hidden items-center gap-3 rounded-[1.35rem] border border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:flex"
          aria-label="Open profile page"
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-[15px] font-semibold text-white">
            {avatarLetter}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-none text-slate-900">
              {userName}
            </p>
            <span className="mt-1 inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium leading-none text-slate-700">
              {roleLabel}
            </span>
          </div>
        </button>
        </div>

        {isSearchVisible ? (
          <div className="mt-3 sm:hidden">
            {searchField}
          </div>
        ) : null}
      </div>
    </header>
  );
}
