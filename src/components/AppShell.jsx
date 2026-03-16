import { useEffect, useMemo, useState } from "react";
import { matchPath, Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./dashboard/Sidebar";
import Navbar from "./dashboard/Navbar";
import { isFeatureEnabled } from "../config/features";
import { useAuth } from "../state/auth";

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.9",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

const ICONS = {
  dashboard: (
    <svg {...iconProps}>
      <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
    </svg>
  ),
  activity: (
    <svg {...iconProps}>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  ),
  attendance: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.7 12.5 2.3 2.2 4.7-5" />
    </svg>
  ),
  marks: (
    <svg {...iconProps}>
      <path d="M4 19h16" />
      <path d="M7 14V9M12 14V6M17 14v-3" />
    </svg>
  ),
  exams: (
    <svg {...iconProps}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  assignments: (
    <svg {...iconProps}>
      <path d="M8 4h8l4 4v12H8z" />
      <path d="M16 4v4h4M11 13h6M11 17h6M11 9h2" />
    </svg>
  ),
  campusServices: (
    <svg {...iconProps}>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.2" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.2" />
    </svg>
  ),
  leave: (
    <svg {...iconProps}>
      <path d="M12 21s-6.5-4.2-8-8.2c-1.4-3.8 1-7.8 5.3-7.8 1.9 0 3.1 1 3.7 2 0 0 1.2-2 3.7-2 4.3 0 6.7 4 5.3 7.8-1.5 4-8 8.2-8 8.2Z" />
    </svg>
  ),
  notices: (
    <svg {...iconProps}>
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  students: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16.5 8.5h4M18.5 6.5v4" />
    </svg>
  ),
  staff: (
    <svg {...iconProps}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M5 11v6l7 4 7-4v-6" />
    </svg>
  ),
  coding: (
    <svg {...iconProps}>
      <path d="M8.5 8 4.5 12l4 4" />
      <path d="m15.5 8 4 4-4 4" />
      <path d="m11 6 2 12" />
    </svg>
  ),
  resume: (
    <svg {...iconProps}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h5" />
    </svg>
  ),
  ai: (
    <svg {...iconProps}>
      <path d="M12 4.5 13.7 8l3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8L6.5 8.5 10.3 8 12 4.5Z" />
      <path d="M18.5 15.5l.8 1.7 1.9.2-1.4 1.3.4 1.9-1.7-.9-1.7.9.4-1.9-1.4-1.3 1.9-.2.8-1.7Z" />
    </svg>
  ),
  a3cad: (
    <svg {...iconProps}>
      <path d="M6.5 6.5h3.5a5 5 0 0 1 0 11H6.5z" />
      <path d="M2.8 9.4h3.7M2.8 14h3.7M14.9 12h6.3" />
      <circle cx="18.2" cy="12" r="1.6" />
    </svg>
  ),
  help: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9.2a3 3 0 1 1 4.7 2.4c-.9.6-1.3 1.1-1.3 2" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
    </svg>
  ),
  profile: (
    <svg {...iconProps}>
      <circle cx="12" cy="8.5" r="3.3" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
  settings: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12a7.1 7.1 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-1.8-1l-.3-2.6h-4l-.3 2.6a7.6 7.6 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.1 7.1 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 1.8 1l.3 2.6h4l.3-2.6a7.6 7.6 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
    </svg>
  ),
  logout: (
    <svg {...iconProps}>
      <path d="M9 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="m14 16 5-4-5-4M19 12H9" />
    </svg>
  ),
};

const SIDEBAR_ITEM_FEATURES = Object.freeze({
  attendance: "attendance",
  coding: "compilers",
  ai: "ai-chat",
});

const filterSidebarItemsByFeature = (items = []) =>
  items.filter((item) => {
    const feature = SIDEBAR_ITEM_FEATURES[item?.id];
    return !feature || isFeatureEnabled(feature);
  });

const getRoleLabel = (role) =>
  role === "staff" ? "Staff" : role === "parent" ? "Parent" : "Student";

const mapRoute = ({ base, role, key }) => {
  if (key === "dashboard") return `${base}/home`;
  if (key === "activity") {
    if (role === "parent") return `${base}/home`;
    return `${base}/todays-schedule`;
  }
  if (key === "campus-services") {
    if (role === "parent") return `${base}/home`;
    return `${base}/menu`;
  }
  if (key === "attendance") {
    if (role === "parent") return `${base}/attendance`;
    return `${base}/menu/attendance`;
  }
  if (key === "marks") return `${base}/menu/marks-progress`;
  if (key === "exams") return `${base}/exam-schedule`;
  if (key === "assignments") return `${base}/menu/assignments`;
  if (key === "leave") return "/leavemanagement/menu";
  if (key === "notices") return role === "parent" ? `${base}/home` : `${base}/menu`;
  if (key === "students") return role === "staff" ? `${base}/menu/student-assignments` : `${base}/home`;
  if (key === "staff") return role === "staff" ? `${base}/menu/parent-replies` : `${base}/home`;
  if (key === "coding") return role === "parent" ? `${base}/home` : `${base}/code`;
  if (key === "ai") return role === "parent" ? `${base}/home` : `${base}/ai`;
  if (key === "a3cad") return role === "parent" ? `${base}/home` : `${base}/a3cad`;
  if (key === "resume") {
    if (role === "student") return `${base}/menu/resume-builder`;
    return `${base}/home`;
  }
  if (key === "profile") return role === "parent" ? `${base}/home` : `${base}/profile`;
  if (key === "settings") return role === "parent" ? `${base}/home` : `${base}/profile`;
  return `${base}/home`;
};

function buildSidebarConfig(role) {
  const base = role === "staff" ? "/staff" : role === "parent" ? "/parent" : "/student";
  const overviewItems = [
    { id: "dashboard", label: "Dashboard", icon: ICONS.dashboard, to: mapRoute({ base, role, key: "dashboard" }) },
    { id: "activity", label: "Today's Schedule", icon: ICONS.activity, to: mapRoute({ base, role, key: "activity" }) },
  ];
  if (role !== "parent") {
    overviewItems.push({
      id: "campus-services",
      label: "Campus Services",
      icon: ICONS.campusServices,
      to: mapRoute({ base, role, key: "campus-services" }),
    });
  }
  const assignmentsItem = {
    id: "assignments",
    label: "Assignments",
    icon: ICONS.assignments,
    to: mapRoute({ base, role, key: "assignments" }),
  };
  const codingItem =
    role === "parent"
      ? {
          id: "coding",
          label: "Coding Practice",
          icon: ICONS.coding,
          to: mapRoute({ base, role, key: "coding" }),
        }
      : {
          id: "coding",
          label: "Coding Practice",
          icon: ICONS.coding,
          to: `${base}/menu`,
          search: "?open=code-learning",
        };
  const toolsItems = [
    { id: "ai", label: "AI Assistant", icon: ICONS.ai, to: mapRoute({ base, role, key: "ai" }) },
    { id: "a3cad", label: "A3cad", icon: ICONS.a3cad, to: mapRoute({ base, role, key: "a3cad" }) },
    codingItem,
  ];
  if (role === "student") {
    toolsItems.push({
      id: "resume",
      label: "Resume Builder",
      icon: ICONS.resume,
      to: mapRoute({ base, role, key: "resume" }),
    });
  }

  const sections = [
    {
      title: "Overview",
      items: overviewItems,
    },
    {
      title: "Academics",
      items: [
        { id: "attendance", label: "Attendance", icon: ICONS.attendance, to: mapRoute({ base, role, key: "attendance" }) },
        { id: "marks", label: "Marks & Progress", icon: ICONS.marks, to: mapRoute({ base, role, key: "marks" }) },
        { id: "exams", label: "Exam Schedule", icon: ICONS.exams, to: mapRoute({ base, role, key: "exams" }) },
        assignmentsItem,
      ],
    },
    {
      title: "Tools",
      items: toolsItems,
    },
  ];

  const bottomItems = [
    { id: "help", label: "Help & Support", icon: ICONS.help, to: `${base}/home` },
    { id: "profile", label: "Profile", icon: ICONS.profile, to: mapRoute({ base, role, key: "profile" }) },
  ];
  bottomItems.push({ id: "logout", label: "Logout", icon: ICONS.logout, action: "logout" });

  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: filterSidebarItemsByFeature(section.items),
    }))
    .filter((section) => section.items.length > 0);
  const filteredBottomItems = filterSidebarItemsByFeature(bottomItems);

  return { base, sections: filteredSections, bottomItems: filteredBottomItems };
}

const findActiveItemId = (pathname, search, sections, bottomItems) => {
  const flattened = sections
    .flatMap((group) => group.items)
    .concat(bottomItems.filter((item) => typeof item.to === "string"));

  const exactMatchWithSearch = flattened.find((item) => {
    if (!matchPath({ path: item.to, end: true }, pathname)) return false;
    if (!item.search) return false;
    return item.search === (search || "");
  });
  if (exactMatchWithSearch) return exactMatchWithSearch.id;

  const exactMatch = flattened.find((item) =>
    matchPath({ path: item.to, end: true }, pathname)
  );
  if (exactMatch) return exactMatch.id;

  const prefixMatch = flattened.find((item) =>
    matchPath({ path: `${item.to}/*`, end: false }, pathname)
  );
  return prefixMatch?.id || "dashboard";
};

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, profile, user, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const safeRole = role === "staff" || role === "parent" ? role : "student";
  const roleLabel = getRoleLabel(safeRole);
  const { sections, bottomItems } = useMemo(
    () => buildSidebarConfig(safeRole),
    [safeRole]
  );
  const profileRoute = useMemo(
    () => bottomItems.find((item) => item.id === "profile")?.to || "",
    [bottomItems]
  );
  const activeItemId = useMemo(
    () => findActiveItemId(location.pathname, location.search, sections, bottomItems),
    [bottomItems, location.pathname, location.search, sections]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const baseUserName = String(
    profile?.name || user?.displayName || user?.email || "Campus Member"
  )
    .trim()
    .replace(/@.*/, "");
  const userName =
    safeRole === "parent"
      ? baseUserName
        ? /\bparent\b$/i.test(baseUserName)
          ? baseUserName
          : `${baseUserName}'s Parent`
        : "Parent"
      : baseUserName;
  const avatarLetter = baseUserName ? baseUserName.charAt(0).toUpperCase() : "C";

  const handleNavigateFromSidebar = async (item) => {
    if (item.action === "logout") {
      if (isLoggingOut) return;
      setIsLoggingOut(true);
      try {
        await logout();
        navigate("/", { replace: true });
      } catch {
        setIsLoggingOut(false);
      }
      return;
    }

    if (item.to) {
      if (item.search) {
        navigate({
          pathname: item.to,
          search: item.search,
        });
      } else {
        navigate(item.to);
      }
      setMobileSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          roleLabel={roleLabel}
          sections={sections}
          bottomItems={bottomItems}
          activeItemId={activeItemId}
          onNavigate={handleNavigateFromSidebar}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <Navbar
            userName={userName || "Campus Member"}
            roleLabel={roleLabel}
            avatarLetter={avatarLetter}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onMenuToggle={() => setMobileSidebarOpen(true)}
            onProfileClick={() => {
              if (profileRoute) navigate(profileRoute);
            }}
          />

          <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
