import { normalizeRemoteImageUrl } from "../utils/media";

export const USER_ROLES = Object.freeze({
  STUDENT: "student",
  STAFF: "staff",
  CANTEEN_STAFF: "canteen_staff",
  ADMIN: "admin",
});

export const MENU_ITEM_STATUS = Object.freeze({
  AVAILABLE: "available",
  LIMITED: "limited",
  SOLD_OUT: "sold_out",
  HIDDEN: "hidden",
});

export const ORDER_STATUS = Object.freeze({
  PLACED: "placed",
  COLLECTED: "collected",
  CANCELLED: "cancelled",
});

export const LOW_STOCK_THRESHOLD = 5;

export const MENU_CATEGORIES = Object.freeze([
  "Breakfast",
  "Snacks",
  "Meals",
  "Drinks",
  "Desserts",
  "Combos",
]);

export const ORDERING_APP_ALLOWED_ROLES = Object.freeze([
  USER_ROLES.STUDENT,
  USER_ROLES.STAFF,
  USER_ROLES.ADMIN,
]);
export const STUDENT_APP_ALLOWED_ROLES = ORDERING_APP_ALLOWED_ROLES;
export const CANTEEN_APP_ALLOWED_ROLES = Object.freeze([
  USER_ROLES.CANTEEN_STAFF,
  USER_ROLES.ADMIN,
]);

export const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

export const normalizeRole = (value) => {
  const role = normalizeText(value).toLowerCase();
  if (role === USER_ROLES.ADMIN) return USER_ROLES.ADMIN;
  if (role === USER_ROLES.STAFF) return USER_ROLES.STAFF;
  if (role === USER_ROLES.CANTEEN_STAFF) return USER_ROLES.CANTEEN_STAFF;
  return USER_ROLES.STUDENT;
};

export const hasAnyRole = (role, allowedRoles = []) =>
  allowedRoles.includes(normalizeRole(role));

export const isStudentRole = (role) =>
  normalizeRole(role) === USER_ROLES.STUDENT;

export const isCanteenManagerRole = (role) =>
  hasAnyRole(role, CANTEEN_APP_ALLOWED_ROLES);

export const deriveMenuItemStatus = ({
  quantity,
  visible = true,
  status = MENU_ITEM_STATUS.AVAILABLE,
  lowStockThreshold = LOW_STOCK_THRESHOLD,
}) => {
  const safeQuantity = toInteger(quantity);
  const safeStatus = normalizeText(status).toLowerCase();

  if (!visible || safeStatus === MENU_ITEM_STATUS.HIDDEN) {
    return MENU_ITEM_STATUS.HIDDEN;
  }

  if (safeQuantity <= 0) {
    return MENU_ITEM_STATUS.SOLD_OUT;
  }

  if (safeStatus === MENU_ITEM_STATUS.SOLD_OUT) {
    return MENU_ITEM_STATUS.SOLD_OUT;
  }

  if (
    safeStatus === MENU_ITEM_STATUS.LIMITED ||
    safeQuantity <= toInteger(lowStockThreshold, LOW_STOCK_THRESHOLD)
  ) {
    return MENU_ITEM_STATUS.LIMITED;
  }

  return MENU_ITEM_STATUS.AVAILABLE;
};

export const isMenuItemVisibleToStudents = (item) =>
  Boolean(item?.visible) &&
  deriveMenuItemStatus(item) !== MENU_ITEM_STATUS.HIDDEN;

export const isMenuItemOrderable = (item) => {
  const status = deriveMenuItemStatus(item);
  return (
    isMenuItemVisibleToStudents(item) &&
    item?.quantity > 0 &&
    status !== MENU_ITEM_STATUS.SOLD_OUT
  );
};

export const buildMenuItemRecord = (id, data = {}) => {
  const quantity = toInteger(data.quantity);
  const visible = data.visible !== false;
  const effectiveStatus = deriveMenuItemStatus({
    quantity,
    visible,
    status: data.status,
  });

  return {
    id,
    name: normalizeText(data.name),
    description: normalizeText(data.description),
    image: normalizeRemoteImageUrl(data.image),
    price: toNumber(data.price),
    category: normalizeText(data.category),
    quantity,
    status: effectiveStatus,
    visible: effectiveStatus !== MENU_ITEM_STATUS.HIDDEN,
    createdBy: normalizeText(data.createdBy),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
};

export const buildOrderRecord = (id, data = {}) => ({
  id,
  userId: normalizeText(data.userId),
  userName: normalizeText(data.userName),
  userEmail: normalizeText(data.userEmail),
  items: Array.isArray(data.items) ? data.items : [],
  totalAmount: toNumber(data.totalAmount),
  itemCount: toInteger(data.itemCount),
  status: normalizeText(data.status).toLowerCase() || ORDER_STATUS.PLACED,
  tokenNumber: normalizeText(data.tokenNumber),
  createdDateKey: normalizeText(data.createdDateKey),
  createdAt: data.createdAt ?? null,
  updatedAt: data.updatedAt ?? null,
});
