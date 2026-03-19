export const getLearningBasePath = (role) =>
  role === "staff" ? "/staff" : "/student";

export const getLearningTabs = (basePath) => [
  { label: "Home", to: `${basePath}/learning`, end: true },
  { label: "Dashboard", to: `${basePath}/learning/dashboard` },
  { label: "Progress", to: `${basePath}/learning/progress` },
];
