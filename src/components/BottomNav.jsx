import { useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { isFeatureEnabled } from "../config/features";
import { useAuth } from "../state/auth";

export default function BottomNav() {
  const { role } = useAuth();
  const base = role === "staff" ? "/staff" : role === "parent" ? "/parent" : "/student";
  const location = useLocation();
  const [hoverIndex, setHoverIndex] = useState(-1);
  const iconProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  const attendanceEnabled = isFeatureEnabled("attendance");
  const marksEnabled = isFeatureEnabled("marks");
  const compilersEnabled = isFeatureEnabled("compilers");
  const learningEnabled = isFeatureEnabled("learning");
  const aiChatEnabled = isFeatureEnabled("ai-chat");

  const navItems = role === "parent"
    ? [
        {
          to: `${base}/home`,
          label: "Home",
          icon: (
            <svg {...iconProps}>
              <path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-5v-5.5h-5V21H4.5a1 1 0 0 1-1-1z" />
              <circle cx="12" cy="15" r="1" />
            </svg>
          ),
        },
        {
          to: `${base}/attendance`,
          label: "Attendance",
          icon: (
            <svg {...iconProps}>
              <circle cx="12" cy="12" r="8.5" />
              <path d="m8.7 12.5 2.3 2.2 4.7-5" />
            </svg>
          ),
        },
        {
          to: `${base}/menu/marks-progress`,
          label: "Progress",
          icon: (
            <svg {...iconProps}>
              <path d="M4.5 18.5h15" />
              <path d="m7.5 14 3-3 2.5 2.5 4.5-4.5" />
            </svg>
          ),
        },
      ]
    : [
        {
          to: `${base}/home`,
          label: "Home",
          icon: (
            <svg {...iconProps}>
              <path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-5v-5.5h-5V21H4.5a1 1 0 0 1-1-1z" />
              <circle cx="12" cy="15" r="1" />
            </svg>
          ),
        },
        {
          to: `${base}/attendance`,
          label: "Attendance",
          icon: (
            <svg {...iconProps}>
              <circle cx="12" cy="12" r="8.5" />
              <path d="m8.7 12.5 2.3 2.2 4.7-5" />
            </svg>
          ),
        },
        {
          to: `${base}/menu`,
          label: "Menu",
          icon: (
            <svg {...iconProps}>
              <rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
              <rect x="13.5" y="4.5" width="6" height="6" rx="1.2" />
              <rect x="4.5" y="13.5" width="6" height="6" rx="1.2" />
              <rect x="13.5" y="13.5" width="6" height="6" rx="1.2" />
            </svg>
          ),
        },
        {
          to: learningEnabled ? `${base}/learning` : `${base}/code`,
          label: learningEnabled ? "Code learning" : "Code",
          icon: (
            <svg {...iconProps}>
              <path d="M8.5 8 4.5 12l4 4" />
              <path d="m15.5 8 4 4-4 4" />
              <path d="m11 6 2 12" />
            </svg>
          ),
        },
        {
          to: `${base}/ai`,
          label: "AI",
          icon: (
            <svg {...iconProps}>
              <path d="M12 3.5 13.7 8l4.8 1.7-4.8 1.7L12 16l-1.7-4.6L5.5 9.7 10.3 8 12 3.5Z" />
              <path d="M18.5 14.5 19.4 17l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.5Z" />
            </svg>
          ),
        },
        {
          to: `${base}/profile`,
          label: "Profile",
          icon: (
            <svg {...iconProps}>
              <circle cx="12" cy="8.5" r="3.3" />
              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
            </svg>
          ),
        },
      ];
  const filteredNavItems = navItems.filter((item) => {
    if (!attendanceEnabled && item.to.endsWith("/attendance")) return false;
    if (!marksEnabled && item.to.includes("/marks-progress")) return false;
    if (!compilersEnabled && !learningEnabled && item.to.endsWith("/code")) return false;
    if (!learningEnabled && item.to.endsWith("/learning")) return false;
    if (!aiChatEnabled && item.to.endsWith("/ai")) return false;
    return true;
  });

  const activeIndex = filteredNavItems.findIndex((item) =>
    matchPath({ path: item.to, end: false }, location.pathname)
  );
  const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;
  const displayIndex = hoverIndex >= 0 ? hoverIndex : resolvedIndex;
  const itemPercent = 100 / filteredNavItems.length;
  const indicatorLeft = `${itemPercent * displayIndex}%`;
  const indicatorOffset = `calc(${itemPercent / 2}% - var(--indicator-size) / 2)`;

  return (
    <nav
      className="mint-nav"
      aria-label="Primary"
      onMouseLeave={() => setHoverIndex(-1)}
      style={{
        "--indicator-left": indicatorLeft,
        "--indicator-offset": indicatorOffset,
      }}
    >
      <div className="mint-nav__shell">
        <ul className="mint-nav__list">
          {filteredNavItems.map((item, index) => {
            const isActive = index === resolvedIndex;
            const isHovered = hoverIndex === index;
            return (
              <li
                key={item.to}
                className={`mint-nav__item${isActive ? " is-active" : ""}${
                  isHovered ? " is-hovered" : ""
                }`}
                onMouseEnter={() => setHoverIndex(index)}
              >
                <NavLink
                  to={item.to}
                  className="mint-nav__link"
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex(-1)}
                >
                  <span className="mint-nav__icon">{item.icon}</span>
                  <span className="mint-nav__label">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
          <span className="mint-nav__indicator" aria-hidden="true" />
        </ul>
      </div>
    </nav>
  );
}
